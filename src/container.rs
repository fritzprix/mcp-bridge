use bollard::container::{Config, CreateContainerOptions, RemoveContainerOptions, AttachContainerOptions, AttachContainerResults};
use bollard::Docker;
use bollard::models::HostConfig;
use uuid::Uuid;
use anyhow::{Result, Context};


use tokio::io::{AsyncReadExt, AsyncWriteExt, stdin, stdout, stderr};

pub struct ContainerManager {
    docker: Docker,
    pub container_id: String,
}

impl ContainerManager {
    pub async fn new(image: &str, mounts: Vec<String>, env_vars: Vec<String>, command: Vec<String>) -> Result<Self> {
        let docker = Docker::connect_with_local_defaults()
            .context("Failed to connect to Docker daemon")?;

        let uuid = Uuid::new_v4();
        let container_name = format!("mcp-bridge-{}", uuid);

        let config = Config {
            image: Some(image),
            tty: Some(false), // Critical: false to avoid PTY corruption
            open_stdin: Some(true),
            stdin_once: Some(true),
            attach_stdin: Some(true),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            env: Some(env_vars.iter().map(|s| s.as_str()).collect()),
            cmd: Some(command.iter().map(|s| s.as_str()).collect()),
            host_config: Some(HostConfig {
                binds: Some(mounts),
                ..Default::default()
            }),
            ..Default::default()
        };

        log_to_stderr(&format!("Creating container: {}", container_name));

        let res = docker.create_container(
            Some(CreateContainerOptions {
                name: container_name.clone(),
                ..Default::default()
            }),
            config,
        ).await.context("Failed to create container")?;

        Ok(Self {
            docker,
            container_id: res.id,
        })
    }

    pub async fn start(&self) -> Result<()> {
        log_to_stderr(&format!("Starting container: {}", self.container_id));
        self.docker.start_container::<String>(&self.container_id, None)
            .await
            .context("Failed to start container")?;
        Ok(())
    }

    pub async fn attach_and_pipe(&self) -> Result<()> {
        let options = AttachContainerOptions::<String> {
            stdin: Some(true),
            stdout: Some(true),
            stderr: Some(true),
            stream: Some(true),
            logs: Some(true),
            ..Default::default()
        };

        let AttachContainerResults { output, mut input } = self.docker
            .attach_container(&self.container_id, Some(options))
            .await?;

        // Handle Input: Host Stdin -> Container Stdin
        let input_handle = tokio::spawn(async move {
            let mut stdin = stdin();
            let mut buffer = [0; 1024];
            loop {
                match stdin.read(&mut buffer).await {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                         if input.write_all(&buffer[..n]).await.is_err() {
                             break;
                         }
                    }
                    Err(_) => break,
                }
            }
        });

        // Handle Output: Container Stdout/Stderr -> Host Stdout/Stderr
        // Bollard's `output` stream yields LogOutput entries
        let output_handle = tokio::spawn(async move {
            use bollard::container::LogOutput;
            use futures_util::StreamExt;
            
            let mut stream = output;
            let mut stdout = stdout();
            let mut stderr = stderr();

            while let Some(Ok(log)) = stream.next().await {
                 match log {
                     LogOutput::StdOut { message } => {
                         let _ = stdout.write_all(&message).await;
                         let _ = stdout.flush().await; // Ensure immediate flush
                     }
                     LogOutput::StdErr { message } => {
                         let _ = stderr.write_all(&message).await;
                         let _ = stderr.flush().await;
                     }
                     LogOutput::Console { message } => {
                         let _ = stdout.write_all(&message).await;
                     }
                     LogOutput::StdIn { .. } => {
                         // Ignore StdIn in output stream
                     }
                 }
            }
        });

        // Race: Wait for output stream to close OR container to exit.
        // This prevents hanging if the output stream doesn't close immediately.
        let mut wait_stream = self.docker.wait_container::<String>(&self.container_id, None);
        let waiter_handle = tokio::spawn(async move {
            use futures_util::StreamExt;
            // wait_container returns a stream of WaitContainerResults
            // We just wait for one or for stream end.
            if wait_stream.next().await.is_some() {}
        });

        tokio::select! {
            _ = output_handle => {},
            _ = waiter_handle => {},
        }
        
        // We can abort input if output finishes
        input_handle.abort();

        Ok(())
    }
}

impl Drop for ContainerManager {
    fn drop(&mut self) {
        log_to_stderr(&format!("Cleaning up container: {}", self.container_id));
        let docker = self.docker.clone();
        let id = self.container_id.clone();
        
        // Drop is sync, but we need to call async docker function.
        // We can spawn a blocking thread or use tokio::task::block_in_place if inside runtime vs 
        // creating a new runtime. 
        // Safe bet for cleanup in Drop (which might panic if runtime is gone) matches:
        // Spawning a thread to do the cleanup using a new runtime if needed, 
        // OR essentially fire-and-forget won't work well because the program is exiting.
        
        // Correct approach for async drop is tricky in Rust. 
        // Usually, we want an explicit cleanup method. Drop is a fallback.
        // Given the requirement "Guaranteed Cleanup (Drop Trait)", we must try our best.
        // We can use a standard blocking call since we are exiting anyway.
        // However, bollard is async.
        
        // NOTE: Doing async work in Drop is discouraged/hard. 
        // A common pattern is `tokio::task::block_in_place` or `futures::executor::block_on`.
        // Let's try `tokio::runtime::Handle::current().block_on(...)` if possible, 
        // or creates a new runtime if the current one is shutting down (panic).
        
        // Actually, to keep it simple and robust for this CLI tool:
        // We can create a dedicated single-threaded runtime just for this cleanup 
        // if we are not sure about existing runtime state.
        
        // Implementation:
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                 let _ = docker.remove_container(&id, Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                })).await;
            });
        }).join().unwrap();
    }
}

fn log_to_stderr(msg: &str) {
    eprintln!("[mcp-bridge] {}", msg);
}

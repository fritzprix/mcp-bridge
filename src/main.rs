mod container;
mod paths;

use clap::Parser;
use anyhow::Result;
use crate::container::ContainerManager;
use crate::paths::resolve_mounts;
use tokio::signal;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Docker image to use
    #[arg(long, default_value = "mcp-server:latest")]
    image: String,

    /// Environment variables (e.g. KEY=VALUE)
    #[arg(long = "env", short = 'e', action = clap::ArgAction::Append)]
    env: Vec<String>,

    /// Volume mounts (e.g. host_path:container_path)
    #[arg(long = "mount", short = 'v', action = clap::ArgAction::Append)]
    mount: Vec<String>,

    /// Command to run inside the container
    #[arg(trailing_var_arg = true)]
    command: Vec<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // Resolve paths
    // If no mounts, resolve_mounts returns empty vec
    let mounts = resolve_mounts(&args.mount)?;

    // Create Container
    let container = ContainerManager::new(
        &args.image, 
        mounts, 
        args.env, 
        args.command
    ).await?;

    // Start Container
    container.start().await?;

    // Attach and pipe I/O
    // We race the piping logic against Ctrl+C
    tokio::select! {
        res = container.attach_and_pipe() => {
             if let Err(e) = res {
                 eprintln!("[mcp-bridge] Error during I/O piping: {}", e);
                 // We return error so main returns Err, but Drop still runs.
                 return Err(e);
             }
        }
        _ = signal::ctrl_c() => {
             eprintln!("\n[mcp-bridge] Received Ctrl+C, shutting down...");
        }
    }

    // container is dropped here -> Cleanup runs
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_args_parsing_basic() {
        let args = Args::try_parse_from(&[
            "mcp-bridge",
            "--image", "test-image",
            "echo", "hello"
        ]).unwrap();

        assert_eq!(args.image, "test-image");
        assert_eq!(args.command, vec!["echo", "hello"]);
    }

    #[test]
    fn test_args_parsing_defaults() {
        let args = Args::try_parse_from(&[
            "mcp-bridge",
            "ls"
        ]).unwrap();

        assert_eq!(args.image, "mcp-server:latest");
        assert_eq!(args.command, vec!["ls"]);
    }

    #[test]
    fn test_args_parsing_multiple_mounts_env() {
        let args = Args::try_parse_from(&[
            "mcp-bridge",
            "--mount", "./src:/src",
            "--mount", "./logs:/logs",
            "--env", "KEY1=VAL1",
            "-e", "KEY2=VAL2",
            "ls"
        ]).unwrap();

        assert_eq!(args.mount.len(), 2);
        assert_eq!(args.mount[0], "./src:/src");
        assert_eq!(args.mount[1], "./logs:/logs");
        
        assert_eq!(args.env.len(), 2);
        assert_eq!(args.env[0], "KEY1=VAL1");
        assert_eq!(args.env[1], "KEY2=VAL2");
    }
}

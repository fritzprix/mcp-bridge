use anyhow::{Context, Result};
use std::fs;
use std::path::Path;

/// Resolves a list of mount strings (host_path:container_path) to absolute host paths.
pub fn resolve_mounts(mounts: &[String]) -> Result<Vec<String>> {
    let mut resolved_mounts = Vec::new();

    for mount in mounts {
        let parts: Vec<&str> = mount.split(':').collect();
        if parts.len() < 2 {
            anyhow::bail!("Invalid mount format: '{}'. Expected 'host_path:container_path'", mount);
        }

        let host_path_str = parts[0];
        let container_path = parts[1..].join(":"); // Rejoin the rest in case container path has colons? Usually safe to just take parts[1] but paths can be complex.
        // Actually, docker mount format is typically host:container or host:container:options. 
        // For simplicity, let's assume host:container for now.
        
        let path = Path::new(host_path_str);
        
        let absolute_path = fs::canonicalize(path)
            .with_context(|| format!("Failed to resolve host path '{}'", host_path_str))?;
            
        let absolute_path_str = absolute_path.to_string_lossy();
        resolved_mounts.push(format!("{}:{}", absolute_path_str, container_path));
    }

    Ok(resolved_mounts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_resolve_mounts_valid() -> Result<()> {
        let dir = tempdir()?;
        let dir_path = dir.path();
        let dir_str = dir_path.to_str().unwrap();

        // Create a subdir to check resolution
        let subdir = dir_path.join("subdir");
        std::fs::create_dir(&subdir)?;
        let subdir_str = subdir.to_str().unwrap();

        // Inputs: "abs_path:/mnt" and "relative_path:/mnt2"
        // We'll use the absolute path of temp dir for simplicity and correctness in test env
        let mount1 = format!("{}:/mnt/1", dir_str);
        
        // For relative path test, we'd need to change CWD or use a known relative path. 
        // Changing CWD in tests is risky due to threading. 
        // We will test strict absolute path resolution here.
        
        let mounts = vec![mount1.clone()];
        let resolved = resolve_mounts(&mounts)?;
        
        let expected = format!("{}:/mnt/1", std::fs::canonicalize(dir_path)?.to_string_lossy());
        assert_eq!(resolved[0], expected);

        Ok(())
    }

    #[test]
    fn test_resolve_mounts_invalid_format() {
        let mounts = vec!["invalid_mount".to_string()];
        let result = resolve_mounts(&mounts);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_mounts_nonexistent_path() {
        let mounts = vec!["/nonexistent/path:/mnt".to_string()];
        let result = resolve_mounts(&mounts);
        assert!(result.is_err());
    }
}

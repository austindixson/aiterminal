pub mod executor;
pub mod loader;
pub mod manifest;

use crate::error::Result;
use std::collections::HashMap;

pub struct SkillManager {
    skills: HashMap<String, String>,
}

impl SkillManager {
    pub fn new() -> Self {
        SkillManager {
            skills: HashMap::new(),
        }
    }

    pub fn register(&mut self, name: &str, code: &str) -> Result<()> {
        self.skills.insert(name.to_string(), code.to_string());
        Ok(())
    }

    pub fn get(&self, name: &str) -> Option<&String> {
        self.skills.get(name)
    }
}
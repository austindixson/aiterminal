use ferroclaw::skills::SkillManager;

#[test]
fn test_manager_creation() {
    let manager = SkillManager::new();
    assert!(manager.is_ok());
}

#[test]
fn test_skill_registration() {
    let mut manager = SkillManager::new();
    let result = manager.register("test-skill", "echo test");
    assert!(result.is_ok());
}
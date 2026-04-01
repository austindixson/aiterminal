use ferroclaw::skills::SkillExecutor;

#[test]
fn test_executor_creation() {
    let executor = SkillExecutor::new();
    assert!(executor.is_ok());
}

#[test]
fn test_skill_execution() {
    let executor = SkillExecutor::new();
    let result = executor.execute("echo test");
    assert!(result.is_ok());
}
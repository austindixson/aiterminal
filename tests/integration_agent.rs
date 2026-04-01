use ferroclaw::agent::Agent;

#[test]
fn test_agent_creation() {
    let agent = Agent::new("test-agent");
    assert_eq!(agent.name, "test-agent");
}

#[test]
fn test_agent_execution() {
    let mut agent = Agent::new("test-agent");
    let result = agent.execute("echo test");
    assert!(result.is_ok());
}
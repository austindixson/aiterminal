use ferroclaw::channels::Channel;

#[test]
fn test_channel_creation() {
    let channel = Channel::new("test");
    assert_eq!(channel.name, "test");
}

#[test]
fn test_channel_send() {
    let channel = Channel::new("test");
    let result = channel.send("test message");
    assert!(result.is_ok());
}
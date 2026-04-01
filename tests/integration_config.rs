use ferroclaw::config::Config;

#[test]
fn test_config_loading() {
    let config = Config::load("config.example.toml");
    assert!(config.is_ok());
}

#[test]
fn test_config_defaults() {
    let config = Config::default();
    assert_eq!(config.name, "ferroclaw");
}
use ferroclaw::tui::TUI;

#[test]
fn test_tui_creation() {
    let tui = TUI::new();
    assert!(tui.is_ok());
}

#[test]
fn test_tui_render() {
    let tui = TUI::new();
    let result = tui.render("test");
    assert!(result.is_ok());
}
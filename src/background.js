// Opens the side panel (Chrome, Edge) or the sidebar (Firefox) when the toolbar button is clicked.
const api = globalThis.browser ?? globalThis.chrome;
if (api.sidePanel && api.sidePanel.setPanelBehavior) {
  api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} else if (api.sidebarAction && api.action) {
  api.action.onClicked.addListener(() => api.sidebarAction.toggle());
}

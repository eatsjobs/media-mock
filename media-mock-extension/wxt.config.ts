import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  manifest: {
    name: 'MediaMock',
    description: 'Mock media devices for testing web applications',
    permissions: ['activeTab', 'scripting', 'tabs'],
    host_permissions: ['<all_urls>'],
    web_accessible_resources: [
      {
        resources: ['inject-mediamock.js'],
        matches: ['<all_urls>']
      }
    ]
  }
});
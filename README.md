# Salesforce Query Tool

A modern, Discord-inspired desktop application for querying Salesforce data. Built with Electron, React, and TypeScript.

**[🌐 Visit the Website](https://ferovar.github.io/SalesforceQueryTool/)** | **[📥 Download Latest Release](https://github.com/ferovar/SalesforceQueryTool/releases/latest)**

![Salesforce Query Tool](docs/screenshot.png)

## Features

- 🎨 **Modern Dark Theme** - Discord-inspired UI for comfortable extended use
- 🔐 **Secure Authentication** - Login with username/password or OAuth
- 💾 **Saved Credentials** - Securely store and manage multiple logins
- 🏢 **Multi-Environment** - Support for both Production and Sandbox orgs
- 📋 **Object Browser** - Browse and search all Salesforce objects
- 🔍 **Query Builder** - Visual field selection and SOQL editing
- 💾 **Saved Queries** - Save and manage queries per object
- 📊 **Results Table** - Sortable, scrollable data grid
- 📥 **CSV Export** - Export query results with one click
- 🗑️ **Include Deleted** - Query deleted records (queryAll)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ferovar/SalesforceQueryTool.git
cd SalesforceQueryTool
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

### Building for Production

To create a Windows executable:

```bash
npm run package
```

The installer will be created in the `release` folder.

## Project Structure

```
SalesforceQueryTool/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── main.ts          # Main entry point
│   │   ├── preload.ts       # Preload script for IPC
│   │   └── services/        # Backend services
│   │       ├── salesforce.ts    # Salesforce API integration
│   │       └── credentials.ts   # Secure credential storage
│   │
│   └── renderer/            # React frontend
│       ├── index.html       # Main HTML
│       ├── splash.html      # Splash screen
│       ├── main.tsx         # React entry point
│       ├── App.tsx          # Main app component
│       ├── components/      # Reusable components
│       │   ├── TitleBar.tsx
│       │   ├── ObjectList.tsx
│       │   ├── QueryBuilder.tsx
│       │   └── ResultsTable.tsx
│       ├── pages/           # Page components
│       │   ├── LoginPage.tsx
│       │   └── MainPage.tsx
│       ├── styles/          # CSS styles
│       │   └── globals.css
│       └── types/           # TypeScript definitions
│           └── electron.d.ts
│
├── assets/                  # App icons and assets
├── package.json
├── tsconfig.json           # TypeScript config (renderer)
├── tsconfig.main.json      # TypeScript config (main)
├── vite.config.ts          # Vite configuration
├── tailwind.config.js      # Tailwind CSS configuration
└── postcss.config.js       # PostCSS configuration
```

## Usage

### Logging In

1. Select your environment (Production or Sandbox)
2. Choose your login method:
   - **Username & Password**: Enter your Salesforce credentials and security token
   - **OAuth**: Opens a browser window for Salesforce authentication (requires Connected App setup)
3. Optionally save your credentials for future logins

### Querying Data

1. Browse or search for an object in the left sidebar
2. Click an object to load its fields
3. Use the "Fields" button to select which fields to include
4. Modify the SOQL query as needed
5. Click "Run Query" to execute
6. Use "Include Deleted" to also retrieve deleted records

### Exporting Data

1. After running a query, click "Export CSV"
2. Choose a location to save the file
3. The file will open in your default CSV application

## Security

- Credentials are encrypted using AES-256-CBC before storage
- Encryption keys are stored per-user
- No data is sent to third parties
- All Salesforce communication uses official APIs

## OAuth Setup (Optional)

To use OAuth authentication, you need to create a Connected App in Salesforce:

1. Go to Setup > App Manager > New Connected App
2. Configure OAuth settings with appropriate scopes
3. Update the client ID in the application

## Tech Stack

- **Electron** - Desktop application framework
- **React** - UI library
- **TypeScript** - Type-safe JavaScript
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **jsforce** - Salesforce API library
- **electron-store** - Secure local storage
- **electron-builder** - Application packaging

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

Inspired by [SoqlX](https://github.com/superfell/SoqlX) - a fantastic Mac-only Salesforce query tool.

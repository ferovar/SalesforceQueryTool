<div align="center">

# Salesforce Query Tool

### Navigate your Salesforce data at warp speed

<br/>

A modern desktop application for querying, exploring, and migrating Salesforce data.  
Built with Electron, React, and TypeScript.

<br/>

**[Visit the Website](https://ferovar.github.io/SalesforceQueryTool/)** • **[Download Latest Release](https://github.com/ferovar/SalesforceQueryTool/releases/latest)** • **[Report a Bug](https://github.com/ferovar/SalesforceQueryTool/issues)**

<br/>

![Salesforce Query Tool](docs/screenshot.png)

---

</div>

## Features

### Core Functionality
| Feature | Description |
|---------|-------------|
| **Dual Authentication** | Login with Username/Password + Security Token or OAuth 2.0 |
| **Credential Manager** | Securely store and manage multiple org connections |
| **Multi-Environment** | Seamless switching between Production and Sandbox orgs |
| **Smart Object Browser** | Browse, search, and filter all standard & custom objects |
| **Visual Query Builder** | Point-and-click field selection with SOQL editor |
| **Inline Editing** | Edit records directly in the results table |
| **Recycle Bin Access** | Query and restore deleted records (queryAll) |

### Data Management
| Feature | Description |
|---------|-------------|
| **Advanced Results Table** | Sortable columns, row selection, and pagination |
| **CSV Export** | One-click export of query results |
| **Saved Queries** | Save frequently used queries per object |
| **Query History** | Track and rerun previous queries |
| **Copy Query** | Quickly copy SOQL to clipboard |
| **Recent Objects** | Quick access to recently queried objects |

### Developer Tools
| Feature | Description |
|---------|-------------|
| **Anonymous Apex** | Execute Apex code with full debugging support |
| **Debug Log Viewer** | Browse and analyze debug logs with syntax highlighting |
| **Script Library** | Save and manage reusable Apex scripts |
| **Execution History** | Track Apex execution results over time |

### Migration Tools
| Feature | Description |
|---------|-------------|
| **Multi-Org Migration** | Push records to multiple target orgs simultaneously |
| **Relationship Mapping** | Match lookup fields by ID or External ID |
| **RecordType Mapping** | Automatic RecordType name-to-ID conversion |
| **Field Selection** | Choose which fields to include in migration |
| **Upsert Support** | Use external IDs to update or insert records |

### User Experience
| Feature | Description |
|---------|-------------|
| **Modern UI** | Clean, professional interface designed for extended use |
| **Blazing Fast** | Optimized for large datasets |
| **Production Warnings** | Visual indicators when connected to production |
| **Customizable Settings** | Toggle features like inline editing, migration, and more |
| **Performance Monitor** | Optional FPS and memory usage display |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- npm or yarn

### Quick Start

```bash
# Clone the repository
git clone https://github.com/ferovar/SalesforceQueryTool.git
cd SalesforceQueryTool

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building for Production

```bash
# Windows
npm run package

# macOS
npm run package:mac

# Linux
npm run package:linux

# All platforms
npm run package:all
```

The installer will be created in the `release` folder.

---

## Usage Guide

### Logging In

1. Select your environment (**Production** or **Sandbox**)
2. Choose your login method:
   - **Username & Password**: Enter credentials + security token
   - **OAuth**: Browser-based authentication (requires Connected App)
3. Optionally save credentials for quick access

### Querying Data

1. **Browse** or **search** for an object in the sidebar
2. Click an object to load its fields
3. Use the **Fields** button to select columns
4. Modify the SOQL query as needed
5. Click **Run Query** to execute
6. Toggle **Include Deleted** to query recycle bin

### Editing Records

1. Run a query to display results
2. Double-click any editable cell
3. Make your changes and press **Enter** to save
4. Press **Escape** to cancel editing
5. Changes sync directly to Salesforce

### Executing Anonymous Apex

1. Click the **Apex** button in the toolbar
2. Write or paste your Apex code in the editor
3. Click **Execute** to run the code
4. View results and debug logs in the output panel
5. Save frequently used scripts to your library

### Migrating Records

1. Select records using the checkboxes
2. Click **Push to Another Org**
3. Select one or more target orgs
4. Configure field mappings and relationships
5. Set upsert key if using external IDs
6. Click **Migrate** to transfer records

---

## Security

| Protection | Implementation |
|------------|----------------|
| **Encrypted Storage** | AES-256-CBC encryption for saved credentials |
| **Per-User Keys** | Encryption keys stored at the user level |
| **No Telemetry** | Zero data sent to third parties |
| **Official APIs** | All communication via Salesforce REST API |

---

## Tech Stack

<div align="center">

| Layer | Technology |
|-------|------------|
| **Framework** | Electron |
| **Frontend** | React + TypeScript |
| **Build Tool** | Vite |
| **Styling** | Tailwind CSS |
| **Salesforce API** | jsforce |
| **Storage** | electron-store |
| **Packaging** | electron-builder |
| **Testing** | Jest + React Testing Library |

</div>

---

## Project Structure

```
SalesforceQueryTool/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.ts              # Entry point & IPC handlers
│   │   ├── preload.ts           # Secure bridge to renderer
│   │   └── services/            # Backend services
│   │       ├── salesforce.ts    # SF API integration
│   │       ├── credentials.ts   # Credential encryption
│   │       ├── queries.ts       # Saved query management
│   │       ├── queryHistory.ts  # Query history tracking
│   │       ├── apexScripts.ts   # Apex script library
│   │       └── orgConnectionManager.ts  # Multi-org connections
│   │
│   └── renderer/                # React frontend
│       ├── components/          # UI components
│       ├── pages/               # Page layouts
│       ├── contexts/            # React contexts
│       ├── styles/              # Tailwind & global CSS
│       └── types/               # TypeScript definitions
│
├── assets/                      # Icons and images
└── docs/                        # Documentation & screenshots
```

---

## Roadmap

### Recently Added
- Anonymous Apex execution with debug log viewer
- Query history with search and filtering
- Script library for reusable Apex code
- Enhanced migration with upsert support
- Performance monitoring toggle

### Coming Soon
- Bulk delete operations
- Schema visualization
- SOQL query templates
- Custom report builder

### Under Consideration
- Metadata deployment
- Data loader interface
- REST API explorer
- Scheduled query execution

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Made for the Salesforce community**

<br/>

Star this repo if you find it useful!

</div>


# BTC-Chartview

A high-performance, real-time cryptocurrency tracking dashboard built with **.NET 8** and **React**. This project demonstrates enterprise-grade implementation of low-latency data streaming, secure WebSocket communication, background job processing, and canvas-based data visualization.

## 🎯 Core Architecture

This system implements a **true push-based real-time pipeline**—not REST polling disguised as real-time:


Binance WebSocket → BackgroundService → Channel Buffer → PriceBroadcaster → SignalR Hub → React Canvas Charts


The architecture proves understanding of backpressure management, throttling, and decoupled data flow patterns essential in high-frequency trading systems.

## 🚀 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | .NET 8 (ASP.NET Core) | API, real-time infrastructure |
| **Real-Time** | SignalR + WebSockets | Bi-directional, low-latency data streaming |
| **Background Jobs** | Hangfire + In-Memory Storage | Scheduled aggregation, out-of-band processing |
| **Data Source** | Binance Public WebSocket | Free, push-based crypto market data |
| **Frontend** | React 18 + TypeScript + Vite | UI layer with strict type safety |
| **Charts** | TradingView Lightweight Charts | Canvas-based rendering (60fps) |
| **Styling** | Tailwind CSS / Custom CSS | Responsive, utility-first design |
| **Auth** | JWT Bearer Tokens | Secure SignalR handshake |

## 🛠️ System Design Deep Dive

### 1. Ingestion Engine (`BinanceStreamService`)
A hosted `.NET BackgroundService` that:
- Maintains a persistent WebSocket connection to `wss://stream.binance.com:9443/ws/btcusdt@trade`
- Implements automatic reconnection with exponential backoff
- Uses `System.Threading.Channels` with bounded capacity (500 items) for backpressure control
- Aggregates high-frequency ticks into 250ms batched updates
- Prevents UI thread saturation and memory blowout

### 2. Real-Time Distribution (`SignalR Hub`)
- Authenticated WebSocket connections via JWT tokens in query strings
- Singleton `PriceBroadcaster` service for decoupled event distribution
- Automatic reconnection and connection lifecycle management
- Secure by default—`[Authorize]` attribute on hub, even for public data

### 3. Background Processing (`Hangfire`)
- In-memory job storage for zero-cost local development
- CRON-scheduled daily market summaries at 23:00 UTC
- Hangfire Dashboard for job monitoring and manual triggers
- Decoupled from request pipeline—zero impact on API performance

## 📋 Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js](https://nodejs.org/) (v18 or higher, v20 recommended)
- [Git](https://git-scm.com/)

## ⚙️ Quick Start

### Clone & Restore
```bash
git clone https://github.com/git-clone-adi/BTC-Chartview.git
cd BTC-Chartview
```

### Backend Setup
```bash
cd Backend
dotnet restore
dotnet run
```
The API starts at `http://localhost:5098`.  
Hangfire Dashboard: `http://localhost:5098/hangfire`

### Frontend Setup
```bash
cd Frontend/ClientApp
npm install
npm run dev
```
The React app starts at `http://localhost:5173`.

### Test the Flow
1. Open `http://localhost:5173` in your browser
2. Click "Sign In (demo)" to receive a JWT token
3. Watch live BTC/USDT prices stream into the TradingView chart
4. Verify real-time updates: open multiple browser windows—all sync instantly

## 🔒 Security Implementation

```csharp
// JWT token generation
POST /api/login?username=demo

// SignalR connection with JWT in query string
const connection = new HubConnectionBuilder()
  .withUrl('http://localhost:5098/hubs/marketdata', {
    accessTokenFactory: () => token
  })
  .build();
```

- Tokens expire after 1 hour
- HS256 symmetric signing
- Token validated on every SignalR message
- CORS restricted to frontend origin only

## 📁 Project Structure

```
BTC-Chartview/
├── Backend/
│   ├── Program.cs                    # App configuration, middleware pipeline
│   ├── Hubs/
│   │   └── MarketDataHub.cs         # SignalR hub with JWT auth
│   └── Services/
│       ├── IPriceBroadcaster.cs     # Interface for price distribution
│       ├── PriceBroadcaster.cs      # Singleton event aggregator
│       ├── BinanceStreamService.cs  # WebSocket ingestion worker
│       └── DailySummaryService.cs   # Hangfire job handler
├── Frontend/
│   └── ClientApp/
│       ├── src/
│       │   ├── App.tsx              # Main component with SignalR integration
│       │   └── main.tsx             # React entry point
│       └── package.json
└── README.md
```

## 📈 Performance Characteristics

| Metric | Value |
|--------|-------|
| Data update frequency | Every 250ms (configurable) |
| Chart render performance | Canvas-based, no DOM reflows |
| Memory backpressure | Bounded channel (max 500 items) |
| WebSocket reconnection | Automatic with exponential backoff |
| Job execution | Out-of-band via Hangfire worker threads |

## 🎓 What This Project Demonstrates

1. **Real-Time Architecture Patterns:** Push-based streaming, not polling
2. **.NET Background Services:** Long-running task management with `IHostedService`
3. **Channel-Based Buffering:** Producer-consumer pattern for high-throughput data
4. **Secure WebSockets:** JWT authentication during SignalR handshake
5. **Canvas Rendering:** Direct chart mutations via refs (no React re-renders)
6. **Scheduled Jobs:** Hangfire CRON expressions for daily aggregation
7. **Zero-Cost Cloud Architecture:** Free tiers and public APIs for production-grade demos

## 🤝 Contributing

This is a portfolio project. While I am not actively seeking contributors, feel free to fork this repository and experiment with the SignalR throttling logic, Hangfire persistence layers, or alternative WebSocket data sources.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
```

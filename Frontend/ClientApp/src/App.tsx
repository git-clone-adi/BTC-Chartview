import { useState, useRef, useEffect, useCallback } from 'react';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import {
  createChart, type IChartApi, type ISeriesApi,
  LineSeries, CandlestickSeries, BarSeries, AreaSeries,
  BaselineSeries, HistogramSeries
} from 'lightweight-charts';
import './App.css';

// ── Types ──────────────────────────────────────────────────────────────────
type ChartType = 'line' | 'candlestick' | 'bar' | 'area' | 'baseline' | 'histogram' | 'hlc' | 'hollow';

interface OhlcBar { time: number; open: number; high: number; low: number; close: number; }

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: 'line',        label: 'Line' },
  { id: 'candlestick', label: 'Candles' },
  { id: 'hollow',      label: 'Hollow' },
  { id: 'bar',         label: 'Bars' },
  { id: 'hlc',         label: 'HLC' },
  { id: 'area',        label: 'Area' },
  { id: 'baseline',    label: 'Baseline' },
  { id: 'histogram',   label: 'Volume' },
];

const PAIRS = [
  { symbol: 'btcusdt',  label: 'BTC/USDT',  category: 'Crypto' },
  { symbol: 'ethusdt',  label: 'ETH/USDT',  category: 'Crypto' },
  { symbol: 'bnbusdt',  label: 'BNB/USDT',  category: 'Crypto' },
  { symbol: 'solusdt',  label: 'SOL/USDT',  category: 'Crypto' },
  { symbol: 'xrpusdt',  label: 'XRP/USDT',  category: 'Crypto' },
  { symbol: 'dogeusdt', label: 'DOGE/USDT', category: 'Crypto' },
  { symbol: 'adausdt',  label: 'ADA/USDT',  category: 'Crypto' },
  { symbol: 'ltcusdt',  label: 'LTC/USDT',  category: 'Crypto' },
  { symbol: 'eurusdt',  label: 'EUR/USDT',  category: 'Forex'  },
  { symbol: 'gbpusdt',  label: 'GBP/USDT',  category: 'Forex'  },
  { symbol: 'jpyusdt',  label: 'JPY/USDT',  category: 'Forex'  },
  { symbol: 'audusdt',  label: 'AUD/USDT',  category: 'Forex'  },
];

// ── OHLC Aggregator (builds candles from raw trades) ──────────────────────
function buildOhlc(bars: Map<number, OhlcBar>, price: number, bucketSec = 60): number {
  const bucket = Math.floor(Date.now() / 1000 / bucketSec) * bucketSec;
  const existing = bars.get(bucket);
  if (existing) {
    existing.high  = Math.max(existing.high, price);
    existing.low   = Math.min(existing.low, price);
    existing.close = price;
  } else {
    bars.set(bucket, { time: bucket, open: price, high: price, low: price, close: price });
  }
  return bucket;
}

// ─────────────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [connStatus, setConnStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [sessionHigh, setSessionHigh] = useState<number | null>(null);
  const [sessionLow, setSessionLow] = useState<number | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [chartType, setChartType]       = useState<ChartType>('candlestick');
  const chartTypeRef                    = useRef<ChartType>('candlestick');
  const [activePair, setActivePair]     = useState(PAIRS[0]);
  const [pairMenuOpen, setPairMenuOpen] = useState(false);
  const chartTypeTimeoutRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartTypeChangeTimeRef          = useRef<number>(0);
  
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef         = useRef<ISeriesApi<any> | null>(null);
  const lastPriceRef = useRef<number | null>(null);
  const ohlcBars          = useRef<Map<number, OhlcBar>>(new Map());
  const tokenRef          = useRef<string | null>(null);

  // ── Login ────────────────────────────────────────────────────────────────
  const login = async () => {
    try {
      const res = await fetch('http://localhost:5045/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'demo' })
      });
      if (!res.ok) throw new Error('Login failed');
      const data = await res.json();
      tokenRef.current = data.token;
      setToken(data.token);
    } catch (e) { console.error(e); }
  };

  // ── Switch Pair ──────────────────────────────────────────────────────────
  const switchPair = async (pair: typeof PAIRS[0]) => {
    setActivePair(pair);
    setPairMenuOpen(false);
    ohlcBars.current.clear();
    setSessionHigh(null);
    setSessionLow(null);
    setUpdateCount(0);
    try {
      await fetch('http://localhost:5045/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenRef.current}` },
        body: JSON.stringify({ symbol: pair.symbol })
      });
    } catch (e) { console.error(e); }
  };

  // ── Build / Rebuild Series ───────────────────────────────────────────────
  const buildSeries = useCallback((chart: IChartApi, type: ChartType) => {
    try {
      // Remove existing series
      if (seriesRef.current) { 
        chart.removeSeries(seriesRef.current); 
        seriesRef.current = null; 
      }

      // Build new series based on type
      switch (type) {
        case 'line':
          seriesRef.current = chart.addSeries(LineSeries, { color: '#9DC08B', lineWidth: 2, pointMarkersVisible: false });
          break;
        case 'candlestick':
          seriesRef.current = chart.addSeries(CandlestickSeries, {
            upColor: '#22c55e', downColor: '#ef4444',
            borderUpColor: '#22c55e', borderDownColor: '#ef4444',
            wickUpColor: '#22c55e', wickDownColor: '#ef4444',
          });
          break;
        case 'hollow':
          seriesRef.current = chart.addSeries(CandlestickSeries, {
            upColor: 'transparent', downColor: 'transparent',
            borderUpColor: '#22c55e', borderDownColor: '#ef4444',
            wickUpColor: '#22c55e', wickDownColor: '#ef4444',
          });
          break;
        case 'bar':
          seriesRef.current = chart.addSeries(BarSeries, {
            upColor: '#22c55e', downColor: '#ef4444',
          });
          break;
        case 'hlc':
          seriesRef.current = chart.addSeries(BarSeries, {
            upColor: '#22c55e', downColor: '#ef4444', openVisible: false,
          });
          break;
        case 'area':
          seriesRef.current = chart.addSeries(AreaSeries, {
            lineColor: '#609966',
            topColor: 'rgba(96,153,102,0.25)',
            bottomColor: 'rgba(96,153,102,0)',
            lineWidth: 2,
          });
          break;
        case 'baseline':
          seriesRef.current = chart.addSeries(BaselineSeries, {
            topLineColor: '#9DC08B', topFillColor1: 'rgba(157,192,139,0.18)', topFillColor2: 'rgba(157,192,139,0)',
            bottomLineColor: '#C07070', bottomFillColor1: 'rgba(192,112,112,0)', bottomFillColor2: 'rgba(192,112,112,0.18)',
          });
          break;
        case 'histogram':
          seriesRef.current = chart.addSeries(HistogramSeries, {
            color: '#609966',
            priceFormat: { type: 'volume' },
          });
          break;
        default:
          // Fallback to line series
          seriesRef.current = chart.addSeries(LineSeries, { color: '#9DC08B', lineWidth: 2, pointMarkersVisible: false });
          console.warn(`Unknown chart type: ${type}, defaulting to line`);
      }
    } catch (e) {
      console.error('Error building series:', e);
      seriesRef.current = null;
    }
  }, []);

  // ── Init Chart ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => {
      if (!chartContainerRef.current) return;
      const el = chartContainerRef.current;

      const chart = createChart(el, {
        width: el.clientWidth, height: el.clientHeight,
        layout: { background: { color: '#0F1410' }, textColor: '#607860' },
        grid: { vertLines: { color: 'rgba(93,120,80,0.1)' }, horzLines: { color: 'rgba(93,120,80,0.1)' } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: '#1e293b' },
        timeScale: { borderColor: '#1e293b', timeVisible: true, secondsVisible: true },
      });

      chartRef.current = chart;
      buildSeries(chart, chartType);

      const ro = new ResizeObserver(e => {
        const { width: w, height: h } = e[0].contentRect;
        chart.applyOptions({ width: w, height: h });
      });
      ro.observe(el);
      return () => { ro.disconnect(); chart.remove(); };
    }, 50);
    return () => clearTimeout(t);
  }, [token]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (chartTypeTimeoutRef.current) {
        clearTimeout(chartTypeTimeoutRef.current);
      }
    };
  }, []);

  // ── Switch Chart Type ────────────────────────────────────────────────────
  const handleChartType = (type: ChartType) => {
    setChartType(type);
    chartTypeRef.current = type;
    ohlcBars.current.clear();
    chartTypeChangeTimeRef.current = Date.now();
    
    // Clear any pending timeout
    if (chartTypeTimeoutRef.current) {
      clearTimeout(chartTypeTimeoutRef.current);
    }
    
    // Rebuild series after a small delay to ensure UI is ready
    if (chartRef.current) {
      chartTypeTimeoutRef.current = setTimeout(() => {
        if (chartRef.current) {
          buildSeries(chartRef.current, type);
        }
      }, 50);
    }
  };

  // ── SignalR ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const conn = new HubConnectionBuilder()
      .withUrl('http://localhost:5045/hubs/marketdata', { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    // 1. Listen for PairChanged to sync UI with backend on connect
    conn.on('PairChanged', (pairSymbol: string) => {
      const matched = PAIRS.find(p => p.symbol === pairSymbol.toLowerCase());
      if (matched) {
        setActivePair(matched);
        ohlcBars.current.clear();
      }
    });

    // 2. Use 'any' type briefly to safely parse variations in the JSON payload
    conn.on('TradeUpdate', (data: any) => {
      try {
        // Skip updates if we just switched chart types (gives time for series to initialize)
        if (Date.now() - chartTypeChangeTimeRef.current < 100) {
          return;
        }

        // Parse price - ensure it's always a valid number
        let price: number;
        if (typeof data === 'number') {
          price = data;
        } else {
          const rawPrice = data?.price ?? data?.Price;
          price = typeof rawPrice === 'string' ? parseFloat(rawPrice) : (typeof rawPrice === 'number' ? rawPrice : NaN);
        }

        // Parse volume - ensure it's always a valid number
        let volume: number;
        if (typeof data === 'number') {
          volume = 0.1; // Default small volume if data is just a number
        } else {
          const rawVolume = data?.volume ?? data?.Volume ?? 0;
          volume = typeof rawVolume === 'string' ? parseFloat(rawVolume) : (typeof rawVolume === 'number' ? rawVolume : 0.1);
          // Ensure volume is at least a small positive number for histograms
          if (!isFinite(volume) || volume <= 0) volume = 0.1;
        }

        // Prevent the chart from crashing if payload is completely invalid
        if (!isFinite(price) || price < 0) {
          console.warn('Invalid price:', { rawData: data, price, volume });
          return;
        }

        setPrevPrice(lastPriceRef.current);
        setCurrentPrice(price);
        setUpdateCount(c => c + 1);
        setSessionHigh(h => h === null ? price : Math.max(h, price));
        setSessionLow(l  => l  === null ? price : Math.min(l, price));
        lastPriceRef.current = price;

        if (!seriesRef.current) {
          console.warn('Series not initialized yet');
          return;
        }
        
        // Get current time as Unix timestamp in seconds
        const t = Math.floor(Date.now() / 1000);
        
        // Ensure time is a valid number
        if (!isFinite(t)) {
          console.warn('Invalid time:', t);
          return;
        }

        // OHLC types (candlestick, hollow, bar, hlc)
        if (['candlestick', 'hollow', 'bar', 'hlc'].includes(chartTypeRef.current)) {
          try {
            const bucket = buildOhlc(ohlcBars.current, price);
            const bar = ohlcBars.current.get(bucket);
            if (bar && isFinite(bar.open) && isFinite(bar.high) && isFinite(bar.low) && isFinite(bar.close) && isFinite(bar.time)) {
              (seriesRef.current as ISeriesApi<'Candlestick'>).update({
                time: bar.time as any,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close
              });
            } else {
              console.warn('Invalid OHLC bar:', bar);
            }
          } catch (e) {
            console.warn('OHLC update error:', e, { chartType: chartTypeRef.current, price, bucket: ohlcBars.current });
          }
        }
        // Volume histogram uses trade size
        else if (chartTypeRef.current === 'histogram') {
          try {
            if (isFinite(volume) && volume > 0 && isFinite(t)) {
              const updateData = {
                time: t as any,
                value: volume,
                color: price >= (lastPriceRef.current ?? price) ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)'
              };
              (seriesRef.current as ISeriesApi<'Histogram'>).update(updateData);
            } else {
              console.warn('Invalid histogram values:', { volume, time: t, isFiniteVol: isFinite(volume), isFiniteT: isFinite(t) });
            }
          } catch (e) {
            console.warn('Histogram update error:', e, { volume, time: t });
          }
        }
        // Line / area / baseline
        else {
          try {
            if (isFinite(price) && isFinite(t)) {
              const updateData = {
                time: t as any,
                value: price
              };
              seriesRef.current.update(updateData);
            } else {
              console.warn('Invalid series values:', { price, time: t, isFinitePrice: isFinite(price), isFiniteT: isFinite(t) });
            }
          } catch (e) {
            console.warn('Series update error:', e, { price, time: t, chartType: chartTypeRef.current });
          }
        }
      } catch (e) {
        console.error('TradeUpdate error:', e, { data });
      }
    });

    conn.onreconnecting(() => setConnStatus('connecting'));
    conn.onreconnected(() => setConnStatus('live'));
    conn.onclose(() => setConnStatus('error'));
    conn.start().then(() => setConnStatus('live')).catch(() => setConnStatus('error'));
    return () => { conn.stop(); };
  }, [token]);

  const priceColor = currentPrice !== null && prevPrice !== null
    ? (currentPrice >= prevPrice ? '#22c55e' : '#ef4444') : '#f1f5f9';
  const priceDelta = currentPrice !== null && prevPrice !== null
    ? currentPrice - prevPrice : null;
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Group pairs by category for dropdown
  const categories = [...new Set(PAIRS.map(p => p.category))];

  return (
    <div className="app-container" style={token ? { display: 'block', height: '100vh' } : {}}>
      {!token ? (
        <div className="login-card">
          <span className="login-logo">BTC ◆</span>
          <h1>Trading Terminal</h1>
          <p>Institutional-grade real-time market data</p>
          <div className="login-divider" />
          <button onClick={login} className="login-btn">Enter Terminal</button>
          <div className="login-badge">Live feed · Binance WebSocket</div>
        </div>
      ) : (
        <div className="dashboard-container">

          {/* ── Header ── */}
          <header className="dashboard-header">
            <div className="header-left">

              {/* Pair Selector */}
              <div className="pair-selector" onClick={() => setPairMenuOpen(o => !o)}>
                <span className="pair-badge">{activePair.label}</span>
                <span className="pair-category">{activePair.category}</span>
                <span className="pair-caret">▾</span>
                {pairMenuOpen && (
                  <div className="pair-menu" onClick={e => e.stopPropagation()}>
                    {categories.map(cat => (
                      <div key={cat}>
                        <div className="pair-menu-header">{cat}</div>
                        {PAIRS.filter(p => p.category === cat).map(p => (
                          <div
                            key={p.symbol}
                            className={`pair-menu-item ${p.symbol === activePair.symbol ? 'active' : ''}`}
                            onClick={() => switchPair(p)}
                          >{p.label}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={`live-dot ${connStatus}`}>
                {connStatus === 'live' ? 'LIVE' : connStatus === 'connecting' ? 'CONNECTING…' : 'DISCONNECTED'}
              </div>
            </div>
            <div className="header-right">
              {sessionHigh && (
                <div className="stat-item">
                  <span className="stat-label">Session High</span>
                  <span className="stat-value" style={{ color: '#22c55e' }}>${fmt(sessionHigh)}</span>
                </div>
              )}
              {sessionLow && (
                <div className="stat-item">
                  <span className="stat-label">Session Low</span>
                  <span className="stat-value" style={{ color: '#ef4444' }}>${fmt(sessionLow)}</span>
                </div>
              )}
              {currentPrice && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap: 2 }}>
                  <span className="price-display" style={{ color: priceColor }}>
                    ${fmt(currentPrice)}
                  </span>
                  {priceDelta !== null && (
                    <span className="price-delta" style={{ color: priceColor }}>
                      {priceDelta >= 0 ? '▲' : '▼'} {Math.abs(priceDelta).toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </header>

          {/* ── Chart Type Toolbar ── */}
          <div className="toolbar">
            {CHART_TYPES.map(ct => (
              <button
                key={ct.id}
                className={`type-btn ${chartType === ct.id ? 'active' : ''}`}
                onClick={() => handleChartType(ct.id)}
              >{ct.label}</button>
            ))}
          </div>

          {/* ── Chart ── */}
          <div className="chart-wrapper">
            <div ref={chartContainerRef} className="chart-container" />
          </div>

          {/* ── Status Bar ── */}
          <div className="status-bar">
            <span className="status-dot" />
            <span className="status-item">Ticks <span>{updateCount}</span></span>
            <span className="status-item">Pair <span>{activePair.label}</span></span>
            <span className="status-item">Series <span>{chartType}</span></span>
            <span className="status-item">Feed <span>Binance WS · 250ms</span></span>
            <span className="status-item" style={{ marginLeft: 'auto' }}>
              {new Date().toUTCString().slice(17, 25)} UTC
            </span>
          </div>

        </div>
      )}
    </div>
  );
}
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

public class BinanceStreamService : BackgroundService
{
    private readonly IPriceBroadcaster _broadcaster;
    private readonly ILogger<BinanceStreamService> _logger;
    private string _activePair = "";

    public BinanceStreamService(IPriceBroadcaster broadcaster, ILogger<BinanceStreamService> logger)
    {
        _broadcaster = broadcaster;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            _activePair = _broadcaster.CurrentPair;
            var streamUrl = $"wss://stream.binance.com:9443/ws/{_activePair}@trade";

            try
            {
                using var ws = new ClientWebSocket();
                await ws.ConnectAsync(new Uri(streamUrl), stoppingToken);
                _logger.LogInformation("Connected: {Pair}", _activePair);

                var buffer = new byte[1024 * 4];

                while (ws.State == WebSocketState.Open && !stoppingToken.IsCancellationRequested)
                {
                    // If pair changed, break out to reconnect
                    if (_broadcaster.CurrentPair != _activePair)
                    {
                        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "pair switch", stoppingToken);
                        break;
                    }

                    using var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                    cts.CancelAfter(500); // poll for pair change every 500ms

                    WebSocketReceiveResult result;
                    try { result = await ws.ReceiveAsync(buffer, cts.Token); }
                    catch (OperationCanceledException) { continue; }

                    if (result.MessageType == WebSocketMessageType.Close) break;

                    try
                    {
                        var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        using var doc = JsonDocument.Parse(json);
                        var root = doc.RootElement;

                        // Try to extract price (p) and quantity (q) from Binance trade format
                        if (root.TryGetProperty("p", out var p) && root.TryGetProperty("q", out var q))
                        {
                            var priceStr = p.GetString();
                            var qtyStr = q.GetString();
                            
                            if (!string.IsNullOrWhiteSpace(priceStr) && !string.IsNullOrWhiteSpace(qtyStr)
                                && decimal.TryParse(priceStr, out var price)
                                && decimal.TryParse(qtyStr, out var qty))
                            {
                                // Only send valid prices (decimals are always finite by design)
                                if (price > 0)
                                {
                                    await _broadcaster.UpdatePrice(price, qty);
                                }
                                else
                                {
                                    _logger.LogWarning("Invalid price: {Price}", price);
                                }
                            }
                            else
                            {
                                _logger.LogWarning("Failed to parse price/qty: {PriceStr} / {QtyStr}", priceStr, qtyStr);
                            }
                        }
                        else
                        {
                            _logger.LogWarning("Missing 'p' or 'q' property in message");
                        }
                    }
                    catch (JsonException jex)
                    {
                        _logger.LogError(jex, "JSON parse error");
                    }
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "WS error, reconnecting in 3s");
                await Task.Delay(3000, stoppingToken);
            }
        }
    }
}
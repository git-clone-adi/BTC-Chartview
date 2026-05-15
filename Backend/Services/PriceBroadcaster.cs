using Microsoft.AspNetCore.SignalR;

public class PriceBroadcaster : IPriceBroadcaster
{
    private readonly IHubContext<MarketDataHub> _hubContext;
    public decimal LatestPrice { get; private set; }
    public decimal LatestVolume { get; private set; }
    public string CurrentPair { get; set; } = "btcusdt"; // Default pair

    public PriceBroadcaster(IHubContext<MarketDataHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public async Task UpdatePrice(decimal price, decimal volume)
    {
        // Validate that price is a meaningful positive number
        if (price <= 0) 
        {
            return; // Skip invalid prices
        }

        // Ensure volume is non-negative (decimals are always finite by design)
        if (volume < 0)
        {
            volume = 0;
        }

        LatestPrice = price;
        LatestVolume = volume;
        
        try
        {
            // Always send valid numeric data
            await _hubContext.Clients.All.SendAsync("TradeUpdate", new { 
                price = (double)price,  // Convert to double for JSON serialization
                volume = Math.Max(0.0, (double)volume),  // Ensure non-negative
                time = DateTime.UtcNow.ToUniversalTime()
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Broadcast error: {ex.Message}");
        }
    }
}
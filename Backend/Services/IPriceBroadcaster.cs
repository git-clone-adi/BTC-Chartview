public interface IPriceBroadcaster
{
    Task UpdatePrice(decimal price, decimal volume);
    decimal LatestPrice { get; }
    decimal LatestVolume { get; }
    string CurrentPair { get; set; }
}
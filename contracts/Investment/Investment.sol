pragma solidity ^0.4.23;
import './SafeMathLib.sol';
import './Ownable.sol';
import './Strings.sol';
import './UserData.sol';
import './Bank.sol';
import './ERC20Interface.sol';
import "github.com/oraclize/ethereum-api/oraclizeAPI.sol";

/**
 * @dev This contract accepts COIN deposit with a list of every crypto in desired portfolio
 * @dev (and the % of each) stores this information, then disburses withdrawals when requested
 * @dev in COIN depending on the new price of the coins in the portfolio
**/

contract Investment is Ownable, usingOraclize { 

    using SafeMathLib for uint256;
    using strings for *;
    
    Bank public bank;
    UserData public userData;
    address public coinToken;
    address public cashToken;
    uint256 public customGasPrice;
    
    // Stores all trade info so Oraclize can return and update.
    // idsAndAmts stores both the crypto ID and amounts with a uint8 and uint248 respectively.
    struct TradeInfo {
        uint256[] idsAndAmts;
        address beneficiary;
        bool isBuy;
        bool isCoin;
    }
    
    // Oraclize ID => TradeInfo.
    mapping(bytes32 => TradeInfo) trades;
    
    // Crypto Id => string symbol used for crafting Oraclize URL.
    mapping(uint256 => string) public cryptoSymbols;
    
    // Crypto Id => the inverse (or regular) crypto this id is tied to, if any.
    mapping(uint256 => uint256) public tiedInverse;
    
    // Crypto Id => whether or not this crypto is an inverse.
    mapping (uint256 => bool) public isInverse;

    // Balances of a user's free trades, generally given as reward for DAO voting.
    mapping(address => uint256) public freeTrades;

    event newOraclizeQuery(string description);
    event Buy(address indexed buyer, uint256[] cryptoIds, uint256[] amounts, uint256[] prices, bool isCoin);
    event Sell(address indexed seller, uint256[] cryptoIds, uint256[] amounts, uint256[] prices, bool isCoin);

/** ********************************** Defaults ************************************* **/
    
    /**
     * @dev Constructor function, construct with coinvest token.
     * @param _coinToken The address of the Coinvest COIN token.
     * @param _cashToken Address of the Coinvest CASH token.
     * @param _bank Contract where all of the user Coinvest tokens will be stored.
     * @param _userData Contract where all of the user balances will be stored.
    **/
    constructor(address _coinToken, address _cashToken, address _bank, address _userData)
      public
      payable
    {
        coinToken = _coinToken;
        cashToken = _cashToken;
        bank = Bank(_bank);
        userData = UserData(_userData);

        oraclize_setProof(proofType_TLSNotary | proofStorage_IPFS);
        
        addCrypto(1, "BTC,", 11, false);
        addCrypto(2, "ETH,", 12, false);
        addCrypto(3, "XRP,", 13, false);
        addCrypto(4, "LTC,", 14, false);
        addCrypto(5, "DASH,", 15, false);
        addCrypto(6, "BCH,", 16, false);
        addCrypto(7, "XMR,", 17, false);
        addCrypto(8, "XEM,", 18, false);
        addCrypto(9, "EOS,", 19, false);
        addCrypto(10, "COIN,", 20, false);
        addCrypto(11, "BTC,", 1, true);
        addCrypto(12, "ETH,", 2, true);
        addCrypto(13, "XRP,", 3, true);
        addCrypto(14, "LTC,", 4, true);
        addCrypto(15, "DASH,", 5, true);
        addCrypto(16, "BCH,", 6, true);
        addCrypto(17, "XMR,", 7, true);
        addCrypto(18, "XEM,", 8, true);
        addCrypto(19, "EOS,", 9, true);
        addCrypto(20, "COIN,", 10, true);
        addCrypto(21, "CASH,", 22, false);
        addCrypto(22, "CASH,", 21, true);

        customGasPrice = 20000000000;
        oraclize_setCustomGasPrice(customGasPrice);
    }
  
    function()
      external
      payable
    {
        
    }
  
/** *************************** ApproveAndCall FallBack **************************** **/
  
    /**
     * @dev ApproveAndCall will send us data, we'll determine if the beneficiary is the sender, then we'll call this contract.
    **/
    function receiveApproval(address _from, uint256 _amount, address _token, bytes _data) 
      public
    {
        require(msg.sender == coinToken || msg.sender == cashToken);
        
        // check here to make sure _from == beneficiary in data
        address beneficiary;
        assembly {
            beneficiary := mload(add(_data,36))
        }
        require(_from == beneficiary);
        
        require(address(this).delegatecall(_data));
    }
  
/** ********************************** External ************************************* **/
    
    /**
     * @dev User calls to invest, will then call Oraclize and Oraclize adds holdings.
     * @dev User must first approve this contract to transfer enough tokens to buy.
     * @param _beneficiary The user making the call whose balance will be updated.
     * @param _cryptoIds The Ids of the cryptos to invest in.
     * @param _amounts The amount of each crypto the user wants to buy, delineated in 10 ^ 18 wei.
     * @param _isCoin True/False of the crypto that is being used to invest is COIN/CASH.
    **/
    function buy(address _beneficiary, uint256[] _cryptoIds, uint256[] _amounts, bool _isCoin)
      public
      onlySenderOrToken(_beneficiary)
    returns (bool success)
    {
        require(_cryptoIds.length == _amounts.length);
        require(getPrices(_beneficiary, _cryptoIds, _amounts, _isCoin, true));
        return true;
    }
    
    /**
     * @dev User calls to sell holdings with same parameters as buy.
    **/
    function sell(address _beneficiary, uint256[] _cryptoIds, uint256[] _amounts, bool _isCoin)
      public
      onlySenderOrToken(_beneficiary)
    returns (bool success)
    {
        require(_cryptoIds.length == _amounts.length);
        require(getPrices(_beneficiary, _cryptoIds, _amounts, _isCoin, false));
        return true;
    }
    
/** ********************************** Internal ************************************ **/
    
    /**
     * @dev Broker will call this for an investor to invest in one or multiple assets
     * @param _beneficiary The address that is being bought for
     * @param _cryptoIds The list of uint IDs for each crypto to buy
     * @param _amounts The amounts of each crypto to buy (measured in 10 ** 18 wei!)
     * @param _prices The price of each bought crypto at time of callback.
     * @param _coinValue The amount of coin to transferFrom from user.
     * @param _isCoin True/False of the crypto that is being used to invest is COIN/CASH.
    **/
    function finalizeBuy(address _beneficiary, uint256[] _cryptoIds, uint256[] _amounts, uint256[] _prices, uint256 _coinValue, bool _isCoin)
      internal
    returns (bool success)
    {
        ERC20Interface token;
        if (_isCoin) token = ERC20Interface(coinToken);
        else token = ERC20Interface(cashToken);

        uint256 fee = 4990000000000000000 * (10 ** 18) / _prices[0];
        if (freeTrades[_beneficiary] >  0) freeTrades[_beneficiary] = freeTrades[_beneficiary].sub(1);
        else require(token.transferFrom(_beneficiary, coinvest, fee));
        
        require(token.transferFrom(_beneficiary, bank, _coinValue));

        // We want to allow actual COIN/CASH exchange so users have easy access and we can "CASH" out fees
        if (_cryptoIds[0] == 10 && _cryptoIds.length == 1) {
            require(bank.transfer(_beneficiary, _amounts[0], true));
        } else if (_cryptoIds[0] == 21 && _cryptoIds.length == 1) {
            require(bank.transfer(_beneficiary, _amounts[0], false));
        } else {
            require(userData.modifyHoldings(_beneficiary, _cryptoIds, _amounts, true));
        }

        emit Buy(_beneficiary, _cryptoIds, _amounts, _prices, _isCoin);
        return true;
    }
    
    /**
     * @param _beneficiary The address that is being sold for
     * @param _cryptoIds The list of uint IDs for each crypto
     * @param _amounts The amounts of each crypto to sell (measured in 10 ** 18 wei!)
     * @param _prices The prices of each crypto at time of callback.
     * @param _coinValue The amount of COIN to be transferred to user.
     * @param _isCoin True/False of the crypto that is being used to invest is COIN/CASH.
    **/
    function finalizeSell(address _beneficiary, uint256[] _cryptoIds, uint256[] _amounts, uint256[] _prices, uint256 _coinValue, bool _isCoin)
      internal
    returns (bool success)
    {   
        uint256 fee = 4990000000000000000 * (10 ** 18) / _prices[0];
        if (freeTrades[_beneficiary] > 0) freeTrades[_beneficiary] = freeTrades[_beneficiary].sub(1);
        else {
            require(_coinValue > fee);
            require(bank.transfer(coinvest, fee, _isCoin));
            _coinValue = _coinValue.sub(fee);
        }

        require(bank.transfer(_beneficiary, _coinValue, _isCoin));
        
        // Subtract from balance of each held crypto for user.
        require(userData.modifyHoldings(_beneficiary, _cryptoIds, _amounts, false));
        
        emit Sell(_beneficiary, _cryptoIds, _amounts, _prices, _isCoin);
        return true;
    }
    
/** ******************************** Only Owner ************************************* **/
    
    /**
     * @dev Owner may add a crypto to the investment contract.
     * @param _id Id of the new crypto.
     * @param _symbol Symbol of the new crypto.
     * @param _inverse The inverse crypto id, if any, that this crypto is tied to
     * @param _isInverse Whether or not this crypto is an inverse.
    **/
    function addCrypto(uint256 _id, string _symbol, uint256 _inverse, bool _isInverse)
      public
      onlyOwner
    returns (bool success)
    {

        cryptoSymbols[_id] = _symbol;
        tiedInverse[_id] = _inverse;
        isInverse[_id] = _isInverse;
        return true;
    }
    
    /**
     * @dev Allows Coinvest to reward users with free platform trades.
     * @param _users List of users to reward.
     * @param _trades List of free trades to give to each.
    **/
    function addTrades(address[] _users, uint256[] _trades)
      external
      onlyCoinvest
    {
        require(_users.length == _trades.length);
        
        for (uint256 i = 0; i < _users.length; i++) {
            freeTrades[_users[i]] = freeTrades[_users[i]].add(_trades[i]);
        }     
    }

    /**
     * @dev Allows owner to change address of other contracts in the system.
     * @param _coinToken Address of the COIN token contract.
     * @param _cashToken Address of the CASH token contract.
     * @param _bank Address of the bank contract.
     * @param _userData Address of the user data contract.
    **/
    function changeContracts(address _coinToken, address _cashToken, address _bank, address _userData)
      external
      onlyOwner
    returns (bool success)
    {
        coinToken = _coinToken;
        cashToken = _cashToken;
        bank = Bank(_bank);
        userData = UserData(_userData);
        return true;
    }
    
/** ********************************* Modifiers ************************************* **/
    
    /**
     * @dev For buys and sells we only want an approved broker or the buyer/seller
     * @dev themselves to mess with the buyer/seller's portfolio
     * @param _beneficiary The buyer or seller whose portfolio is being modified
    **/
    modifier onlySenderOrToken(address _beneficiary)
    {
        require(msg.sender == _beneficiary || msg.sender == coinToken || msg.sender == cashToken);
        _;
    }
    
/** ******************************************************************************** **/
/** ******************************* Oracle Logic *********************************** **/
/** ******************************************************************************** **/

    /**
     * @dev Here we Oraclize to CryptoCompare to get prices for these cryptos.
     * @param _cryptos The IDs of the cryptos to get prices for.
     * @param _amounts Amount of each crypto to buy.
     * @param _isCoin True/False of the crypto that is being used to invest is COIN/CASH.
     * @param _buy Whether or not this is a buy (as opposed to sell).
    **/
    function getPrices(address _beneficiary, uint256[] _cryptos, uint256[] _amounts, bool _isCoin, bool _buy) 
      internal
    returns (bool success)
    {
        if (oraclize_getPrice("URL") > this.balance) {
            emit newOraclizeQuery("Oraclize query was NOT sent, please add some ETH to cover for the query fee");
        } else {
            emit newOraclizeQuery("Oraclize query was sent, standing by for the answer..");
            string memory fullUrl = craftUrl(_cryptos, _isCoin);
            
            bytes32 queryId = oraclize_query("URL", fullUrl, 150000 + 50000 * _cryptos.length);
            trades[queryId] = TradeInfo(bitConv(_cryptos, _amounts), _beneficiary, _buy, _isCoin);
        }
        return true;
    }
    
    /**
     * @dev Oraclize calls and should simply set the query array to the int results.
    **/
    function __callback(bytes32 myid, string result, bytes proof)
      public
    {
        if (msg.sender != oraclize_cbAddress()) throw;
    
        TradeInfo memory tradeInfo = trades[myid];
        var (a,b) = bitRec(tradeInfo.idsAndAmts);
        uint256[] memory cryptos = a;
        uint256[] memory amounts = b;

        address beneficiary = tradeInfo.beneficiary;
        bool isBuy = tradeInfo.isBuy;
        bool isCoin = tradeInfo.isCoin;
    
        uint256[] memory cryptoValues = decodePrices(cryptos, result, isCoin);
        uint256 value = calculateValue(amounts, cryptoValues);
        
        if (isBuy) require(finalizeBuy(beneficiary, cryptos, amounts, cryptoValues, value, isCoin));
        else require(finalizeSell(beneficiary, cryptos, amounts, cryptoValues, value, isCoin));
    }
    
/** ******************************* Constants ************************************ **/
    
    /**
     * @dev Crafts URL for Oraclize to grab data from.
     * @param _cryptos The uint256 crypto ID of the cryptos to search.
     * @param _isCoin True if COIN is being used as the investment token.
    **/
    function craftUrl(uint256[] _cryptos, bool _isCoin)
      public
      view
    returns (string)
    {
        if (_isCoin) var url = "https://min-api.cryptocompare.com/data/pricemulti?fsyms=COIN,";
        else url = "https://min-api.cryptocompare.com/data/pricemulti?fsyms=CASH,";

        for (uint256 i = 0; i < _cryptos.length; i++) {
            uint256 id = _cryptos[i];

            require(bytes(cryptoSymbols[id]).length > 0);
            url = url.toSlice().concat(cryptoSymbols[id].toSlice());
        }
        url = url.toSlice().concat("&tsyms=USD".toSlice());
        return url;
    }

    /**
     * @dev Cycles through a list of separators to split the api
     * @dev result string. Returns list so that we can update invest contract with values.
     * @param _cryptos The cryptoIds being decoded.
     * @param _result The raw string returned from the cryptocompare api with all crypto prices.
     * @param _isCoin True/False of the crypto that is being used to invest is COIN/CASH.
    **/
    function decodePrices(uint256[] _cryptos, string _result, bool _isCoin) 
      public
      view
    returns (uint256[])
    {
        var s = _result.toSlice();
        var delim = 'USD'.toSlice();
        var breakPart = s.split(delim).toString();

        uint256[] memory prices = new uint256[](_cryptos.length + 1);
        
        //Find price of COIN first.
        var coinPart = s.split(delim).toString();
        prices[0] = parseInt(coinPart,18);

        for(uint256 i = 0; i < _cryptos.length; i++) {
            // This loop is necessary because cryptocompare will only return 1 value when the same crypto is queried twice.
            uint256 inverse = tiedInverse[i];
            for (uint256 j = 0; j < _cryptos.length; j++) {
                if (j == i) break;
                if (_cryptos[j] == inverse) {
                    prices[i+1] = (10 ** 36) / prices[j+1];
                    break;
                }
            }
            // If the crypto is COIN we don't want it to split price (because compare will only return the first query)
            if (prices[i + 1] == 0 && _isCoin && (_cryptos[i] == 10 || _cryptos[i] == 20)) {
                if (!isInverse[_cryptos[i]]) prices[i+1] = prices[0];
                else prices[i+1] = (10 ** 36) / prices[0];
            }
            // Same deal for CASH
            else if (prices[i + 1] == 0 && !_isCoin && (_cryptos[i] == 20 || _cryptos[i] == 21)) {
                if (!isInverse[_cryptos[i]]) prices[i+1] = prices[0];
                else prices[i+1] = (10 ** 36) / prices[0];
            }
            else if (prices[i+1] == 0) {
                var part = s.split(delim).toString();
        
                uint256 price = parseInt(part,18);
                if (price > 0 && !isInverse[_cryptos[i]]) prices[i+1] = price;
                else if (price > 0) prices[i+1] = (10 ** 36) / price;
            }
        }
        return prices;
    }

    /**
     * @dev Calculate the COIN value of the cryptos to be bought/sold.
     * @param _cryptoValues The value of the cryptos at time of call.
    **/
    function calculateValue(uint256[] _amounts, uint256[] _cryptoValues)
      public
      pure
    returns (uint256 value)
    {
        for (uint256 i = 0; i < _amounts.length; i++) {
            value = value.add(_cryptoValues[i+1].mul(_amounts[i]).div(_cryptoValues[0]));
        }
    }
    
    /**
     * @dev Converts given cryptos and amounts into a single uint256[] array.
     * @param _cryptos Array of the crypto Ids to be bought.
     * @param _amounts Array containing the amounts of each crypto to buy.
    **/
    function bitConv(uint256[] _cryptos, uint256[] _amounts)
      public
      pure
    returns (uint256[])
    {
        uint256[] memory combined = new uint256[](_cryptos.length); 
        for (uint256 i = 0; i < _cryptos.length; i++) {
            combined[i] |= _cryptos[i];
            combined[i] |= _amounts[i] << 8;
        }
        return combined;
    }
    
    /**
     * @dev Recovers the cryptos and amounts from combined array.
     * @param _idsAndAmts Array of uints containing both crypto Id and amount.
    **/
    function bitRec(uint256[] _idsAndAmts) 
      public
      pure
    returns (uint256[], uint256[]) 
    {
        uint256[] memory cryptos = new uint256[](_idsAndAmts.length);
        uint256[] memory amounts = new uint256[](_idsAndAmts.length);

        for (uint256 i = 0; i < _idsAndAmts.length; i++) {
            cryptos[i] = uint256(uint8(_idsAndAmts[i]));
            amounts[i] = uint256(uint248(_idsAndAmts[i] >> 8));
        }
        return (cryptos, amounts);
    }
    
/** *************************** Only Owner *********************************** **/

    /**
     * @dev Change Oraclize gas limit and price.
     * @param _newGasPrice New gas price to use in wei.
    **/
    function changeGas(uint256 _newGasPrice)
      external
      onlyOwner
    returns (bool success)
    {
        customGasPrice = _newGasPrice;
        oraclize_setCustomGasPrice(_newGasPrice);
        return true;
    }
    
/** ************************** Only Coinvest ******************************* **/

    /**
     * @dev Allow the owner to take ERC20 tokens off of this contract if they are accidentally sent.
     * @param _tokenContract The address of the token to withdraw (0x0 if Ether).
     * @param _amount The amount of Ether to withdraw (because some needs to be left for Oraclize).
    **/
    function tokenEscape(address _tokenContract, uint256 _amount)
      external
      onlyCoinvest
    {
        if (_tokenContract == address(0)) coinvest.transfer(_amount);
        else {
            ERC20Interface lostToken = ERC20Interface(_tokenContract);
        
            uint256 stuckTokens = lostToken.balanceOf(address(this));
            lostToken.transfer(coinvest, stuckTokens);
        }
    }
    
}







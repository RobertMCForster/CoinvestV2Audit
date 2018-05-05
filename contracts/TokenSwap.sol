pragma solidity ^0.4.23;
import './CoinvestToken.sol';

contract TokenSwap {
    
    // Address of the old Coinvest COIN token.
    address public constant OLD_TOKEN = 0x0dcd2f752394c41875e259e00bb44fd505297caf;
    
    // Address of the new COINVEST COIN V2 token (to be launched on construction).
    CoinvestToken public newToken;

    constructor() 
      public 
    {
        newToken = new CoinvestToken();
    }

    /**
     * @dev Only function. ERC223 transfer from old token to this contract calls this.
     * @param _from The address that has transferred this contract tokens.
     * @param _value The amount of tokens that have been transferred.
     * @param _data The extra data sent with transfer (should be nothing).
    **/
    function tokenFallback(address _from, uint _value, bytes _data) 
      external
    {
        require(msg.sender == OLD_TOKEN);          // Ensure caller is old token contract.
        require(newToken.transfer(_from, _value)); // Transfer new tokens to sender.
    }
    
}

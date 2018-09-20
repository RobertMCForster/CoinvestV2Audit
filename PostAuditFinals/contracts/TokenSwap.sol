pragma solidity ^0.4.24;
import './CoinvestToken.sol';

contract TokenSwap {
    
    CoinvestToken public oldToken;
    CoinvestToken public newToken;
    
    /**
     * @param _oldToken Address of old COIN token.
     * @param _newToken Address of new COIN token.
    **/
    constructor(address _oldToken, address _newToken) 
      public
    {
        oldToken = CoinvestToken(_oldToken);
        newToken = CoinvestToken(_newToken);
    }

    /**
     * @dev approveAndCall will be used on the old token to transfer from the user
     *      to the contract, which will then return to them the new tokens.
     * @param _from The user that is making the call.
     * @param _amount The amount of tokens being transferred to this swap contract.
     * @param _token The address of the token contract (address(oldToken))--not used.
     * @param _data Extra data with the call--not used.
    **/
    function receiveApproval(address _from, uint256 _amount, address _token, bytes _data) 
      public
    {
        require(msg.sender == address(oldToken));
        require(oldToken.transferFrom(_from, address(this), _amount));
        require(newToken.transfer(_from, _amount));
        _token; _data;
    }
    
}
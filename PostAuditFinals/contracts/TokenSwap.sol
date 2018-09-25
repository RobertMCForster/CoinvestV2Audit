pragma solidity ^0.4.24; import './ERC20Interface.sol'; contract TokenSwap {
    
    ERC20Interface public tokenV1;
    ERC20Interface public tokenV2;
    ERC20Interface public tokenV3;
    
    /**
    **/
    constructor(address _tokenV1, address _tokenV2, address _tokenV3) public {
        tokenV1 = ERC20Interface(_tokenV1);
        tokenV2 = ERC20Interface(_tokenV2);
        tokenV3 = ERC20Interface(_tokenV3);
    }
    /**
     * @param _from The address that has transferred this contract tokens.
     * @param _value The amount of tokens that have been transferred.
     * @param _data The extra data sent with transfer (should be nothing).
    **/
    function tokenFallback(address _from, uint _value, bytes _data)
      external
    {
        require(msg.sender == address(tokenV1));
        require(_value > 0);
        require(tokenV3.transfer(_from, _value));
        _data;
    }
    /**
     * @dev approveAndCall will be used on the old token to transfer from the user
     * to the contract, which will then return to them the new tokens.
     * @param _from The user that is making the call.
     * @param _amount The amount of tokens being transferred to this swap contract.
     * @param _token The address of the token contract (address(oldToken))--not used.
     * @param _data Extra data with the call--not used.
    **/
    function receiveApproval(address _from, uint256 _amount, address _token, bytes _data)
      public
    {
        require(msg.sender == address(tokenV2));
        require(_amount > 0);
        require(tokenV2.transferFrom(_from, address(this), _amount));
        require(tokenV3.transfer(_from, _amount));
        _token; _data;
    }
    
}

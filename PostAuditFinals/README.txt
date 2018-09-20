Changes:


Investment:
Constants added for COIN ID, COIN inverse, CASH ID, and CASH inverse.

Require added in crafturl to assert that multiple of the same cryptocurrency are not bought.

ID system changed: cryptoSymbols is now a string[] list with even numbers representing
regular cryptos and odd representing inverses. In the case we do not want an inverse, the
corresponding odd is set as a blank string (which will be thrown in craftUrl).

Unnecessary success returns and corresponding requires removed.

addCrypto changed to accomodate the ID system change.

Added pause functionality.

decodePrices changed to accomodate the ID system change: inverse is now found by checking
if an ID is even or add, tiedInverse and isInverse mappings removed.

decodePrices magic numbers changed to the previously mentioned constants.

Final check to ensure no prices are 0 added to the end of decodePrices.

Various instances of uint256[] returns modified to use the return variable within the function.

Other compiler warnings silenced (unused variables)

Buy and Sell made payable.

Fallback is now onlyAdmins.

Oraclize throw changed to require.

TradeInfo struct order changed.

first bitConv '|=' changed to '='


Ownable:

solidity version specified.

admins (address => bool) mapping added, alterAdmin function added to add or remove admins,
onlyAdmin modifier added.


SafeMathLib:

solidity version specified.


UserData:

returnHoldings loop changed to begin at 0, end at holdings.length

index of userHoldings[beneficiary] changed from [i] to [_start+i]

modifyHoldings success return removed.

changeInvestment success return removed.


CashToken and CoinvestToken:

receiveApproval's .call changed to .delegatecall

revokeHashPreSigned now increments nonce.


TokenSwap! New contract overall but:

ERC223's tokenFallback changed to receiveApproval which requires sender to be the old token address.

receiveApproval "transferFrom's" old contract, transfers the same amount to beneficiary with the new contract.

It is to be loaded with the total supply of new COIN upon launch and old COIN will be unretrievable.


Sorry for the mess...
<h1>Coinvest V3 Token, Coinvest CASH Token, and Investment</h1>
CoinvestToken.sol => V3truffle.js</br>
CashToken.sol => CashTruffle.js</br>
Investment.sol, Bank.sol, and UserData.sol => investment.js</br>
(Old Coinvest Token is CoinvestTokenV2.sol => ERC865.js)

<h2>Changes made from Coinvest V2:</h2>
1. All fingerprinting of transactions is now done in transaction hash as opposed to signatures. Hash is found in each pre-signed transaction and saved in the same way signatures were.</br>
2. SignatureRedeemed event changed to HashRedeemed event.</br>
3. address(this) added to the hashing in the getRevokeHash function.</br>
4. Error notes added to reverts.</br>
5. approveAndCallPreSigned now only executes an approve if value is > 0. This is to allow other contracts to be called using the token’s pre-signed functionality without going through the approve function.</br>
6. Gas transfers now send to tx.origin instead of msg.sender.</br>
7. Fallback function and related functions were removed to simplify the token as much as possible.</br>
8. ValidPayload was removed for the same reason.</br>
</br>
CASH is simply V3 copy-pasted but with a mint function and burn function  and events added for the owner (and of course the name/symbol is changed). It’s essentially our version of tether but using gold instead of USD. The truffles are also identical besides added mint and burn function testing for CASH. Total supply is the same as COIN for testing but will be changed (or just burned) to whatever is needed upon launch.

import ether from './helpers/ether'
import {advanceBlock} from './helpers/advanceToBlock'
import {increaseTimeTo, duration} from './helpers/increaseTime'
import latestTime from './helpers/latestTime'
import EVMRevert from './helpers/EVMRevert'
import EVMThrow from './helpers/EVMThrow'
import expectThrow from './helpers/expectThrow'; 
import assertRevert from './helpers/assertRevert';
import expectEvent from './helpers/expectEvent'; 

// web3Abi required to test overloaded transfer functions
const web3Abi = require('web3-eth-abi');

// BigNumber is used for handling gwei vars
const BigNumber = web3.BigNumber

// Chai gives you a very nice, straight forward and clean assertion checking mechanisms
const should = require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

// Contract constants
const Investment        = artifacts.require('../contracts/InvestmentTest.sol')
const Token				= artifacts.require('../contracts/CoinvestToken.sol')
const UserData			= artifacts.require('../contracts/UserData.sol')
const Bank				= artifacts.require('../contracts/Bank.sol')

// Promisify get balance of ether
const promisify = (inner) =>
  new Promise((resolve, reject) =>
    inner((err, res) => {
      if (err) { reject(err) }
      resolve(res);
    })
  );

const getBalance = (account, at) =>
  promisify(cb => web3.eth.getBalance(account, at, cb));

contract('Investment', function ([_, wallet]) {

  beforeEach(async function() {

    this.owner             = web3.eth.accounts[0];
    this.accountTwo        = web3.eth.accounts[1];

    // token = COIN token
    this.token             = await Token.new({from:this.owner});
    this.cashToken         = await Token.new({from:this.owner});
    this.bank              = await Bank.new(this.token.address, this.cashToken.address, {from:this.owner});
    this.userData          = await UserData.new("", {from:this.owner});
    this.investment        = await Investment.new(this.token.address, this.cashToken.address,
                            this.bank.address, this.userData.address, {from: this.owner});
    this.web3              = this.token.web3;

    await this.userData.changeInvestment(this.investment.address, {from:this.owner});                
    await this.bank.changeInvestment(this.investment.address, {from:this.owner});

  })

/** ********************************** Core ***************************************** */


  describe('buy', function () {

    it('should fail on inequal _cryptoIds and _amounts', async function () {
        // Only 1 amount here
        await this.investment.buy(this.owner, [1,2], [1], true, {from: this.owner}).should.be.rejectedWith(EVMRevert);
    })

    it('should fail on non-beneficiary, non-token sender', async function () {
        // Sent from accountTwo
        await this.investment.buy(this.owner, [1,2], [1,2], true, {from: this.accountTwo}).should.be.rejectedWith(EVMRevert);
    })

  })

  describe('sell', function () {

    it('should fail on inequal _cryptoIds and _amounts', async function () {
        // Only 1 amount here
        await this.investment.sell(this.owner, [1,2], [1], true, {from: this.owner}).should.be.rejectedWith(EVMRevert);
    })

    it('should fail on non-beneficiary, non-token sender', async function () {
        // Sent from accountTwo
        await this.investment.sell(this.owner, [1,2], [1,2], true, {from: this.accountTwo}).should.be.rejectedWith(EVMRevert);
    })

  })

  describe('__callback buy', function () {

    it('should alter user\'s holdings on UserData on buy', async function () {
        await this.token.approve(this.investment.address,toEther(100),{from:this.owner})

        await this.investment.buy(this.owner, [1,2], [1,2], true, {from: this.owner})

        // Usually this would all happen in one transaction as Oraclize will callback itself
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let holdings = await this.userData.returnHoldings.call(this.owner, 0, 10)
        holdings[1].should.be.bignumber.equal(1)
        holdings[2].should.be.bignumber.equal(2)
    })

    it('should alter user\'s holdings on buy with CASH', async function () {
        await this.cashToken.approve(this.investment.address,toEther(100),{from:this.owner})

        await this.investment.buy(this.owner, [1,2], [1,2], false, {from: this.owner})

        // Usually this would all happen in one transaction as Oraclize will callback itself
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let holdings = await this.userData.returnHoldings.call(this.owner, 0, 10)
        holdings[1].should.be.bignumber.equal(1)
        holdings[2].should.be.bignumber.equal(2)
    })

    it('should alter user\'s inverse holdings on UserData on buy', async function () {
        await this.token.approve(this.investment.address,toEther(100),{from:this.owner})

        await this.investment.buy(this.owner, [1,12], [1,2], true, {from: this.owner})

        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let holdings = await this.userData.returnHoldings.call(this.owner, 0, 12)
        holdings[1].should.be.bignumber.equal(1)
        holdings[12].should.be.bignumber.equal(2)
    })

    it('should send funds to bank on buy', async function () {
        await this.token.approve(this.investment.address,toEther(1000),{from:this.owner})

        await this.investment.buy(this.owner, [1,12], [1,2], true, {from: this.owner})

        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let balance = await this.token.balanceOf(this.bank.address)
        balance.should.be.bignumber.equal(52722)
    })

    it('should send funds to bank on buy with CASH', async function () {
        await this.cashToken.approve(this.investment.address,toEther(1000),{from:this.owner})

        await this.investment.buy(this.owner, [1,12], [1,2], false, {from: this.owner})

        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let balance = await this.cashToken.balanceOf(this.bank.address)
        balance.should.be.bignumber.equal(52722)
    })

    it('should send coinvest fee to coinvest wallet on buy', async function () {
        // Change coinvest address to 0x1 so we can test fees
        await this.investment.transferCoinvest("0x0000000000000000000000000000000000000001")

        await this.token.approve(this.investment.address,toEther(100),{from:this.owner})

        await this.investment.buy(this.owner, [1,12], [1,2], true, {from: this.owner})

        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        // Hacky check here because of JS bignumber pains
        let balance = await this.token.balanceOf("0x0000000000000000000000000000000000000001")
        balance.should.be.bignumber.greaterThan(toEther(32))
        balance.should.be.bignumber.lessThan(toEther(33))
    })

    it('should send coinvest fee to coinvest wallet on buy with CASH', async function () {
        // Change coinvest address to 0x1 so we can test fees
        await this.investment.transferCoinvest("0x0000000000000000000000000000000000000001")

        await this.cashToken.approve(this.investment.address,toEther(100),{from:this.owner})

        await this.investment.buy(this.owner, [1,12], [1,2], false, {from: this.owner})

        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})
        let balance = await this.cashToken.balanceOf("0x0000000000000000000000000000000000000001")
        balance.should.be.bignumber.greaterThan(toEther(32))
        balance.should.be.bignumber.lessThan(toEther(33))
    })

    it('should use free trade and not cost fee if free trade is available', async function () {
        await this.investment.addTrades([this.owner],[2],{from:this.owner})

        // Change coinvest address to 0x1 so we can test fees
        await this.investment.transferCoinvest("0x0000000000000000000000000000000000000001")

        await this.token.approve(this.investment.address,toEther(100),{from:this.owner})

        await this.investment.buy(this.owner, [1,12], [1,2], true, {from: this.owner})

        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let balance = await this.token.balanceOf("0x0000000000000000000000000000000000000001")
        balance.should.be.bignumber.equal(0)
        let trades = await this.investment.freeTrades.call(this.owner)
        trades.should.be.bignumber.equal(1)
    })

    it('should fail with not enough COIN approved', async function () {
        await this.token.approve(this.investment.address,toEther(1),{from:this.owner})

        await this.investment.buy(this.owner, [1,12], [1,2], true, {from: this.owner})

        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner}).should.be.rejectedWith(EVMRevert);
    })

    it('should fail with not enough CASH approved', async function () {
        await this.cashToken.approve(this.investment.address,toEther(1),{from:this.owner})

        await this.investment.buy(this.owner, [1,12], [1,2], false, {from: this.owner})

        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":1.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner}).should.be.rejectedWith(EVMRevert);
    })

  })

  describe('__callback sell', function () {

    it('should fail on sell with insufficient balance', async function () {
        await this.token.approve(this.investment.address,toEther(100),{from:this.owner})

        await this.investment.sell(this.owner, [1,2], [1,2], true, {from: this.owner})

        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner}).should.be.rejectedWith(EVMRevert);
    })

    it('should fail on sell with insufficient CASH balance', async function () {
        await this.cashToken.approve(this.investment.address,toEther(100),{from:this.owner})

        await this.investment.sell(this.owner, [1,2], [1,2], false, {from: this.owner})

        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner}).should.be.rejectedWith(EVMRevert);
    })


    it('should alter user\'s holdings on UserData on sell', async function () {
        // Buy first
        await this.token.approve(this.investment.address,toEther(1000000),{from:this.owner})

        await this.investment.buy(this.owner, [1,2], [toEther(10),toEther(20)], true, {from: this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        // Then sell
        await this.investment.sell(this.owner, [1,2], [toEther(5),toEther(10)], true, {from: this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let holdings = await this.userData.returnHoldings.call(this.owner, 0, 10)
        holdings[1].should.be.bignumber.equal(toEther(5))
        holdings[2].should.be.bignumber.equal(toEther(10))
    })

    it('should alter user\'s holdings on UserData on sell with CASH', async function () {
        // Buy first
        await this.cashToken.approve(this.investment.address,toEther(1000000),{from:this.owner})

        await this.investment.buy(this.owner, [1,2], [toEther(10),toEther(20)], false, {from: this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        // Then sell
        await this.investment.sell(this.owner, [1,2], [toEther(5),toEther(10)], false, {from: this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let holdings = await this.userData.returnHoldings.call(this.owner, 0, 10)
        holdings[1].should.be.bignumber.equal(toEther(5))
        holdings[2].should.be.bignumber.equal(toEther(10))
    })

    it('should alter user\'s inverse holdings on UserData on sell', async function () {
        await this.token.approve(this.investment.address,toEther(1000000),{from:this.owner})

        await this.investment.buy(this.owner, [1,12], [toEther(10),toEther(20)], true, {from:this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        await this.investment.sell(this.owner, [1,12], [toEther(5),toEther(10)], true, {from:this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let holdings = await this.userData.returnHoldings.call(this.owner, 0, 12)
        holdings[1].should.be.bignumber.equal(toEther(5))
        holdings[12].should.be.bignumber.equal(toEther(10))
    })

    it('should take funds from bank and send to user', async function () {
        // Measuring funds will be easier with free trades
        await this.investment.addTrades([this.owner],[5],{from:this.owner})
        await this.token.approve(this.investment.address,toEther(1000000),{from:this.owner})

        await this.investment.buy(this.owner, [1,2], [1,2], true, {from:this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let bankFunds = await this.token.balanceOf(this.bank.address)
        let userFunds = await this.token.balanceOf(this.owner)

        await this.investment.sell(this.owner, [1,2], [1,2], true, {from:this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let postBank = await this.token.balanceOf(this.bank.address)
        postBank.should.be.bignumber.equal(0)
        let postUser = await this.token.balanceOf(this.owner)
        postUser.should.be.bignumber.greaterThan(userFunds)
    })

    it('should take funds from bank and send to user with CASH', async function () {
        // Measuring funds will be easier with free trades
        await this.investment.addTrades([this.owner],[5],{from:this.owner})
        await this.cashToken.approve(this.investment.address,toEther(1000000),{from:this.owner})

        await this.investment.buy(this.owner, [1,2], [1,2], false, {from:this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let bankFunds = await this.cashToken.balanceOf(this.bank.address)
        let userFunds = await this.cashToken.balanceOf(this.owner)

        await this.investment.sell(this.owner, [1,2], [1,2], false, {from:this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let postBank = await this.cashToken.balanceOf(this.bank.address)
        postBank.should.be.bignumber.equal(0)
        let postUser = await this.cashToken.balanceOf(this.owner)
        postUser.should.be.bignumber.greaterThan(userFunds)
    })

    it('should send coinvest fee to coinvest wallet on sell', async function () {
        // Change coinvest address to 0x1 so we can test fees
        await this.investment.transferCoinvest("0x0000000000000000000000000000000000000001")

        await this.token.approve(this.investment.address,toEther(1000000),{from:this.owner})

        await this.investment.buy(this.owner, [1,2], [toEther(10),toEther(20)], true, {from:this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        await this.investment.sell(this.owner, [1,2], [toEther(10),toEther(20)], true, {from:this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let balance = await this.token.balanceOf("0x0000000000000000000000000000000000000001")
        balance.should.be.bignumber.greaterThan(toEther(64))
        balance.should.be.bignumber.lessThan(toEther(65))
    })

    it('should send coinvest fee to coinvest wallet on sell with CASH', async function () {
        // Change coinvest address to 0x1 so we can test fees
        await this.investment.transferCoinvest("0x0000000000000000000000000000000000000001")

        await this.cashToken.approve(this.investment.address,toEther(1000000),{from:this.owner})

        await this.investment.buy(this.owner, [1,2], [toEther(10),toEther(20)], false, {from:this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        await this.investment.sell(this.owner, [1,2], [toEther(10),toEther(20)], false, {from:this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let balance = await this.cashToken.balanceOf("0x0000000000000000000000000000000000000001")
        balance.should.be.bignumber.greaterThan(toEther(64))
        balance.should.be.bignumber.lessThan(toEther(65))
    })

    it('should use free trade and not cost fee if free trade is available', async function () {
        await this.investment.addTrades([this.owner],[3],{from:this.owner})
        await this.investment.transferCoinvest("0x0000000000000000000000000000000000000001")
        await this.token.approve(this.investment.address,toEther(100),{from:this.owner})

        await this.investment.buy(this.owner, [1,2], [1,2], true, {from: this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        await this.investment.sell(this.owner, [1,2], [1,2], true, {from:this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}",'0x0',{from:this.owner})

        let balance = await this.token.balanceOf("0x0000000000000000000000000000000000000001")
        balance.should.be.bignumber.equal(0)
        let trades = await this.investment.freeTrades.call(this.owner)
        trades.should.be.bignumber.equal(1)
    })

  })

  describe('COIN/CASH Exchange', function () {

    it('should return COIN in exchange for CASH', async function () {
        // Let's transfer everything from owner to bank.
        let balance = await this.cashToken.balanceOf(this.owner)
        await this.cashToken.transfer(this.bank.address, balance, {from:this.owner})

        await this.token.approve(this.investment.address,toEther(100),{from:this.owner})
        await this.investment.buy(this.owner, [21], [1], true, {from: this.owner})
        let tx = await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"CASH\":{\"USD\":0.1554}",'0x0',{from:this.owner})

        let newBalance = await this.cashToken.balanceOf(this.owner)
        newBalance.should.be.bignumber.equal(1)
    })

    it('should return CASH in exchange for COIN', async function () {
        // Let's transfer everything from owner to bank.
        let balance = await this.token.balanceOf(this.owner)
        await this.token.transfer(this.bank.address, balance, {from:this.owner})

        await this.cashToken.approve(this.investment.address,toEther(100),{from:this.owner})
        await this.investment.buy(this.owner, [10], [1], false, {from: this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"COIN\":{\"USD\":0.1554}",'0x0',{from:this.owner})
    
        let newBalance = await this.token.balanceOf(this.owner)
        newBalance.should.be.bignumber.equal(1)
    })

    it('should not return COIN in exchange for CASH if bought with other cryptos', async function () {
        // Let's transfer everything from owner to bank.
        let balance = await this.cashToken.balanceOf(this.owner)
        await this.cashToken.transfer(this.bank.address, balance, {from:this.owner})

        await this.token.approve(this.investment.address,toEther(100),{from:this.owner})
        await this.investment.buy(this.owner, [21, 1], [1, 2], true, {from: this.owner})
        let tx = await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"COIN\":{\"USD\":0.1554},{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14}",'0x0',{from:this.owner})

        let newBalance = await this.cashToken.balanceOf(this.owner)
        newBalance.should.be.bignumber.equal(0)
    })

    it('should not return CASH in exchange for COIN if bought with other cryptos', async function () {
        // Let's transfer everything from owner to bank.
        let balance = await this.token.balanceOf(this.owner)
        await this.token.transfer(this.bank.address, balance, {from:this.owner})

        await this.cashToken.approve(this.investment.address,toEther(100),{from:this.owner})
        await this.investment.buy(this.owner, [10, 10], [1, 1], false, {from: this.owner})
        await this.investment.__callback('0x0000000000000000000000000000000000000000000000000000000000000001',"{\"CASH\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14}",'0x0',{from:this.owner})
    
        let holdings = await this.userData.userHoldings(this.owner, 10)
        holdings.should.be.bignumber.equal(2)
        let bankBalance = await this.cashToken.balanceOf(this.bank.address)
        bankBalance.should.be.bignumber.equal(52722)
    })

  })

/** ******************************************** Constants **************************************************** **/

  describe('craftUrl', function () {

    it('should return correct url for one crypto', async function () {
        let url = await this.investment.craftUrl([1],true,{from:this.owner})
        url.should.be.equal("https://min-api.cryptocompare.com/data/pricemulti?fsyms=COIN,BTC,&tsyms=USD")
    })

    it('should return correct url for multiple cryptos', async function () {
        let url = await this.investment.craftUrl([1,4,7,3],true,{from:this.owner})
        url.should.be.equal("https://min-api.cryptocompare.com/data/pricemulti?fsyms=COIN,BTC,LTC,XMR,XRP,&tsyms=USD")
    })

    it('should return correct url for inverse cryptos', async function () {
        let url = await this.investment.craftUrl([11,14],true,{from:this.owner})
        url.should.be.equal("https://min-api.cryptocompare.com/data/pricemulti?fsyms=COIN,BTC,LTC,&tsyms=USD")
    })

    it('should return correct url for regular and inverse cryptos', async function () {
        let url = await this.investment.craftUrl([2,5,15,12],true,{from:this.owner})
        url.should.be.equal("https://min-api.cryptocompare.com/data/pricemulti?fsyms=COIN,ETH,DASH,DASH,ETH,&tsyms=USD")
    })

    it('should fail on unknown id', async function () {
        await this.investment.craftUrl([41],true,{from:this.owner}).should.be.rejectedWith(EVMRevert);
    })

  })

  describe('decodePrices', function () {

    it('should return 8180.87e18 for BTC price', async function () {
        let price = await this.investment.decodePrices.call([1],"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8180.87}}", true)
        price[1].should.be.bignumber.equal(toEther(8180.87))
    })

    it('should return 8193.14e18 for BTC price and 473.36e18 for ETH price', async function () {
        let price = await this.investment.decodePrices.call([1,2],"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8193.14},\"ETH\":{\"USD\":473.36}}", true)
        price[1].should.be.bignumber.equal(toEther(8193.14))
        price[2].should.be.bignumber.equal(toEther(473.36))
    })

    it('should return 1/8180.87e18 for inverse BTC price', async function () {
        let price = await this.investment.decodePrices.call([11],"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8180.87}}", true)
        // Too many sig figs for bignumber here so we're gonna shorten it up
        price[1].should.be.bignumber.equal(122236388061416)
    })

    it('should return 1/8180.87e18 for inverse BTC price and 8180.87e18 for regular BTC price', async function () {
        let price = await this.investment.decodePrices.call([11,1],"{\"COIN\":{\"USD\":0.1554},{\"BTC\":{\"USD\":8180.87}}", true)
        price[1].should.be.bignumber.equal(122236388061416)
        // This is slightly off $8180.87 because we're finding the inverse of the inverse which results in very slight, non-meaningful changes
        // Using greater than and less than because JS bignumbers are terrible...
        price[2].should.be.bignumber.greaterThan(8180870000000030000000)
        price[2].should.be.bignumber.lessThan(8180870000000040000000)
    })

  })

  describe('calculateValue', function () {

    it('should return 10 ** 18 for one crypto worth $10 (with COIN worth $1)', async function () {
        let price = await this.investment.calculateValue.call([toEther(1)],[toEther(1),toEther(10)])
        price.should.be.bignumber.equal(toEther(10))
    })

    it('should return $91 price for 10 crypto @ $0.10, 10 @ $6, and 15 @ $2', async function () {
        let price = await this.investment.calculateValue.call([toEther(10),toEther(10),toEther(15)],[toEther(1), toEther(0.1),toEther(6),toEther(2)])
        price.should.be.bignumber.equal(toEther(91))
    })

  })

  describe('Public Variables', function () {

    it('should return bank address from bank variable', async function () {
        let bank = await this.investment.bank.call()
        bank.should.be.bignumber.equal(this.bank.address)
    })

    it('should return userData address from userData variable', async function () {
        let userData = await this.investment.userData.call()
        userData.should.be.bignumber.equal(this.userData.address)
    })

    it('should return COIN token address from token variable', async function () {
        let token = await this.investment.coinToken.call()
        token.should.be.bignumber.equal(this.token.address)
    })

    it('should return CASH token address from token variable', async function () {
        let token = await this.investment.cashToken.call()
        token.should.be.bignumber.equal(this.cashToken.address)
    })

    it('should return customGasPrice amount from customGasPrice variable', async function () {
        let price = await this.investment.customGasPrice.call()
        price.should.be.bignumber.equal(20000000000)
    })

    it('should return correct cryptoSymbols from cryptoSymbols mapping', async function () {
        let btc = await this.investment.cryptoSymbols.call(1)
        btc.should.be.equal("BTC,")
        let eth = await this.investment.cryptoSymbols.call(2)
        eth.should.be.equal("ETH,")
        let xrp = await this.investment.cryptoSymbols.call(3)
        xrp.should.be.equal("XRP,")
        let ltc = await this.investment.cryptoSymbols.call(4)
        ltc.should.be.equal("LTC,")
        let dash = await this.investment.cryptoSymbols.call(5)
        dash.should.be.equal("DASH,")
        let bch = await this.investment.cryptoSymbols.call(6)
        bch.should.be.equal("BCH,")
        let xmr = await this.investment.cryptoSymbols.call(7)
        xmr.should.be.equal("XMR,")
        let xem = await this.investment.cryptoSymbols.call(8)
        xem.should.be.equal("XEM,")
        let eos = await this.investment.cryptoSymbols.call(9)
        eos.should.be.equal("EOS,")
    })

  })


/** *************************************** Only Owner Functions *********************************************** */

  describe('addCrypto', function () {

    it('should add new crypto to symbols', async function () {
        await this.investment.addCrypto(23,"SOL,",46,false,{from:this.owner})
        let symbol = await this.investment.cryptoSymbols.call(23)
        symbol.should.be.equal("SOL,")
    })

    it('should fail on non-owner call', async function () {
        await this.investment.addCrypto(23,"SOL,",46,false,{from:this.accountTwo}).should.be.rejectedWith(EVMRevert);
    })

  })

  describe('changeContracts', function () {

    it('should change the connected contracts', async function () {
        await this.investment.changeContracts("0x1","0x2","0x3","0x4",{from:this.owner})
        let token = await this.investment.coinToken.call()
        let cashToken = await this.investment.cashToken.call()
        let bank = await this.investment.bank.call()
        let userData = await this.investment.userData.call()

        token.should.be.equal("0x0000000000000000000000000000000000000001")
        cashToken.should.be.equal("0x0000000000000000000000000000000000000002")
        bank.should.be.equal("0x0000000000000000000000000000000000000003")
        userData.should.be.equal("0x0000000000000000000000000000000000000004")
    })

    it('should fail on non-owner change attempt', async function () {
        await this.investment.changeContracts("0x1","0x2","0x3","0x4",{from:this.accountTwo}).should.be.rejectedWith(EVMRevert);
    })

  })

  describe('changeGas', function () {

    it('should change custom gas price', async function () {
        await this.investment.changeGas(11,{from:this.owner})
        let gasPrice = await this.investment.customGasPrice.call()
        gasPrice.should.be.bignumber.equal(11)
    })

    it('should fail on non-owner call', async function () {
        await this.investment.changeGas(11,{from:this.accountTwo}).should.be.rejectedWith(EVMRevert);
    })

  })

  describe('tokenEscape', function () {

    it('should release all stuck tokens to coinvest', async function () {
        await this.token.transfer(this.investment.address,toEther(2000),{from:this.owner})
        await this.investment.tokenEscape(this.token.address,toEther(1),{from:this.owner})

        let investBalance = await this.token.balanceOf.call(this.investment.address)
        investBalance.should.be.bignumber.equal(0)

        let ownerBalance = await this.token.balanceOf.call(this.owner)
        ownerBalance.should.be.bignumber.equal(toEther(107142857))
    })

    it('should release Ether to coinvest', async function () {
        let firstBalance = await web3.eth.getBalance(this.owner)

        await web3.eth.sendTransaction({to:this.investment.address,value:toEther(2),from:this.owner})
        await this.investment.tokenEscape(0x0,toEther(1),{from:this.owner})

        let investBalance = await web3.eth.getBalance(this.investment.address)
        investBalance.should.be.bignumber.equal(toEther(1))

        let ownerBalance = await web3.eth.getBalance(this.owner)
        ownerBalance.should.be.bignumber.lessThan(firstBalance - toEther(1))
        ownerBalance.should.be.bignumber.greaterThan(firstBalance - toEther(2))
    })

    it('should fail on non-owner call', async function () {
        await this.token.transfer(this.investment.address,5000,{from:this.owner})
        await this.investment.tokenEscape(this.token.address,1,{from:this.accountTwo}).should.be.rejectedWith(EVMRevert);
    })

  })

  describe('addTrades', function () {

    it('should add free trades to user', async function () {
        await this.investment.addTrades([this.accountTwo],[3],{from:this.owner})
        let trades = await this.investment.freeTrades.call(this.accountTwo)
        trades.should.be.bignumber.equal(3)
    })

    it('should add free trades to multiple users', async function () {
        await this.investment.addTrades([this.accountTwo, this.owner],[3, 55555],{from:this.owner})
        
        let tradesOne = await this.investment.freeTrades.call(this.owner)
        tradesOne.should.be.bignumber.equal(55555)

        let tradesTwo = await this.investment.freeTrades.call(this.accountTwo)
        tradesTwo.should.be.bignumber.equal(3)
    })

    it('should fail on non-owner call', async function () {
        await this.investment.addTrades([this.accountTwo],[1],{from:this.accountTwo}).should.be.rejectedWith(EVMRevert);
    })

    it('should fail with unequal users and trades', async function () {
        await this.investment.addTrades([this.accountTwo],[3,4],{from:this.owner}).should.be.rejectedWith(EVMRevert);
    })

  })

    function toEther(value) {
        return web3.toWei(value, "ether")
    }
  
})

/********************************************************************************************************/
/******************************************** User Data *************************************************/
/********************************************************************************************************/

contract('UserData', function ([_, wallet]) {

    beforeEach(async function() {
  
      this.owner             = web3.eth.accounts[0];
      this.accountTwo        = web3.eth.accounts[1];
  
      this.token             = await Token.new({from:this.owner});
      this.userData          = await UserData.new("", {from:this.owner});
      this.web3              = this.token.web3;
  
      await this.userData.changeInvestment(this.owner, {from:this.owner});                
  
    })

    describe('modifyHoldings', function () {

        it('should increase holdings on buy', async function () {
            await this.userData.modifyHoldings(this.owner,[1,2],[1,2],true,{from:this.owner})
            let btc = await this.userData.userHoldings.call(this.owner,1)
            let eth = await this.userData.userHoldings.call(this.owner,2)
            btc.should.be.bignumber.equal(1)
            eth.should.be.bignumber.equal(2)
        })

        it('should decrease holdings on sell', async function () {
            await this.userData.modifyHoldings(this.owner,[1,2],[10,20],true,{from:this.owner})
            await this.userData.modifyHoldings(this.owner,[1,2],[5,10],false,{from:this.owner})

            let btc = await this.userData.userHoldings.call(this.owner,1)
            let eth = await this.userData.userHoldings.call(this.owner,2)

            btc.should.be.bignumber.equal(5)
            eth.should.be.bignumber.equal(10)
        })

        it('should fail on non-investment call', async function () {
            await this.userData.modifyHoldings(this.owner,[1,2],[10,20],true,{from:this.accountTwo}).should.be.rejectedWith(EVMRevert);
        })

    })

    describe('changeInvestment', function () {

        it('should change address of investment contract', async function () {
            let original = await this.userData.investmentAddress.call()
            original.should.be.equal(this.owner)

            await this.userData.changeInvestment(this.accountTwo,{from:this.owner})

            let newAddr = await this.userData.investmentAddress.call()
            newAddr.should.be.equal(this.accountTwo)
        })

        it('should fail on non-owner call', async function () {
            await this.userData.changeInvestment(this.accountTwo,{from:this.accountTwo}).should.be.rejectedWith(EVMRevert);
        })

    })

    describe('tokenEscape', function () {

        it('should release all stuck tokens to coinvest', async function () {
            await this.token.transfer(this.userData.address,toEther(2000),{from:this.owner})
            await this.userData.tokenEscape(this.token.address,{from:this.owner})
    
            let dataBalance = await this.token.balanceOf.call(this.userData.address)
            dataBalance.should.be.bignumber.equal(0)
    
            let ownerBalance = await this.token.balanceOf.call(this.owner)
            ownerBalance.should.be.bignumber.equal(toEther(107142857))
        })
    
        // Would have to selfdestruct a contract to get Ether in here to test or something...
        it('should release Ether to coinvest', async function () {
            let firstBalance = await web3.eth.getBalance(this.owner)
    
            //await web3.eth.sendTransaction({to:this.bank.address,value:toEther(3),from:this.owner})
            await this.userData.tokenEscape(0x0,{from:this.owner})
    
            let dataBalance = await web3.eth.getBalance(this.userData.address)
            dataBalance.should.be.bignumber.equal(0)
    
            let ownerBalance = await web3.eth.getBalance(this.owner)
        })
    
        it('should fail on non-owner call', async function () {
            await this.token.transfer(this.userData.address,500000000,{from:this.owner})
            await this.userData.tokenEscape(this.token.address,{from:this.accountTwo}).should.be.rejectedWith(EVMRevert);
        })
    
      })
    
    describe('returnHoldings', function () {

        it('should return correct holdings for user', async function () {
            await this.userData.modifyHoldings(this.owner,[1,2],[1,2],true,{from:this.owner})

            let holdings = await this.userData.returnHoldings.call(this.owner,0,10)
            holdings[1].should.be.bignumber.equal(1)
            holdings[2].should.be.bignumber.equal(2)
        })

        it('should return correct inverse holdings for user', async function () {
            await this.userData.modifyHoldings(this.owner,[11,12],[1,2],true,{from:this.owner})

            let holdings = await this.userData.returnHoldings.call(this.owner,0,15)
            holdings[11].should.be.bignumber.equal(1)
            holdings[12].should.be.bignumber.equal(2)
        })

        it('should return correct holdings and inverse holdings for user', async function () {
            await this.userData.modifyHoldings(this.owner,[1,12],[1,2],true,{from:this.owner})

            let holdings = await this.userData.returnHoldings.call(this.owner,0,15)
            holdings[1].should.be.bignumber.equal(1)
            holdings[12].should.be.bignumber.equal(2)
        })

    })

    describe('Public Variables', function () {

        it('should return investment contract', async function () {
            let investAddr = await this.userData.investmentAddress.call()
            investAddr.should.be.equal(this.owner)
        })

    })

    function toEther(value) {
        return web3.toWei(value, "ether")
    }

})

/********************************************************************************************************/
/*********************************************** Bank ***************************************************/
/********************************************************************************************************/

contract('Bank', function ([_, wallet]) {

    beforeEach(async function() {
  
      this.owner             = web3.eth.accounts[0];
      this.accountTwo        = web3.eth.accounts[1];
  
      this.coinToken         = await Token.new({from:this.owner});
      this.cashToken         = await Token.new({from:this.owner});
      this.bank              = await Bank.new(this.coinToken.address, this.cashToken.address, {from:this.owner});
      this.userData          = await UserData.new("", {from:this.owner});
      this.investment        = await Investment.new(this.coinToken.address, this.cashToken.address,
                            this.bank.address, this.userData.address, {from: this.owner});
      this.web3              = this.coinToken.web3;
  
      await this.userData.changeInvestment(this.investment.address, {from:this.owner});                
      await this.bank.changeInvestment(this.investment.address, {from:this.owner});
  
    })

    describe('transfer', function () {

        it('should transfer COIN for investment', async function () {
            await this.coinToken.transfer(this.bank.address,100000,{from:this.owner})
            await this.bank.changeInvestment(this.owner,{from:this.owner})
            await this.bank.transfer(this.accountTwo,10000,true,{from:this.owner})

            let balance = await this.coinToken.balanceOf(this.accountTwo)
            balance.should.be.bignumber.equal(10000)
        })

        it('should transfer CASH for investment', async function () {
            await this.cashToken.transfer(this.bank.address,100000,{from:this.owner})
            await this.bank.changeInvestment(this.owner,{from:this.owner})
            await this.bank.transfer(this.accountTwo,10000,false,{from:this.owner})
            
            let balance = await this.cashToken.balanceOf(this.accountTwo)
            balance.should.be.bignumber.equal(10000)
        })

        it('should fail on non-investment call', async function () {
            await this.coinToken.transfer(this.bank.address,100000,{from:this.owner})
            //await this.bank.changeInvestment(this.owner,{from:this.owner})
            await this.bank.transfer(this.accountTwo,10000,true,{from:this.owner}).should.be.rejectedWith(EVMRevert);
        })

    })

    describe('changeInvestment', function () {

        it('should change address of investment contract', async function () {
            let original = await this.bank.investmentAddr.call()
            original.should.be.equal(this.investment.address)

            await this.bank.changeInvestment(this.owner,{from:this.owner})

            let newAddr = await this.bank.investmentAddr.call()
            newAddr.should.be.equal(this.owner)
        })

    })

    describe('tokenEscape', function () {

        it('should release all stuck tokens to coinvest', async function () {
            // Must create new token because original won't be able to be withdrawn
            this.token2 = await Token.new({from:this.owner});

            await this.token2.transfer(this.bank.address,toEther(2000),{from:this.owner})
            await this.bank.tokenEscape(this.token2.address,{from:this.owner})
    
            let bankBalance = await this.token2.balanceOf.call(this.bank.address)
            bankBalance.should.be.bignumber.equal(0)
    
            let ownerBalance = await this.token2.balanceOf.call(this.owner)
            ownerBalance.should.be.bignumber.equal(toEther(107142857))
        })
    
        // Would have to selfdestruct a contract to get Ether in here to test or something...
        it('should release Ether to coinvest', async function () {
            let firstBalance = await web3.eth.getBalance(this.owner)
    
            //await web3.eth.sendTransaction({to:this.bank.address,value:toEther(3),from:this.owner})
            await this.bank.tokenEscape(0x0,{from:this.owner})
    
            let bankBalance = await web3.eth.getBalance(this.bank.address)
            bankBalance.should.be.bignumber.equal(0)
    
            let ownerBalance = await web3.eth.getBalance(this.owner)
        })
    
        it('should fail on non-owner call', async function () {
            // Must create new token because original won't be able to be withdrawn
            this.token2 = await Token.new({from:this.owner});

            await this.token2.transfer(this.bank.address,500000000,{from:this.owner})
            await this.bank.tokenEscape(this.token2.address,{from:this.accountTwo}).should.be.rejectedWith(EVMRevert);
        })

        it('should fail on Coinvest COIN token withdrawal attempt', async function () {
            await this.coinToken.transfer(this.bank.address,500000000,{from:this.owner})
            await this.bank.tokenEscape(this.coinToken.address,{from:this.owner}).should.be.rejectedWith(EVMRevert);
        })

        it('should fail on Coinvest CASH token withdrawal attempt', async function () {
            await this.coinToken.transfer(this.bank.address,500000000,{from:this.owner})
            await this.bank.tokenEscape(this.cashToken.address,{from:this.owner}).should.be.rejectedWith(EVMRevert);
        })
    
    })
    
    
    describe('Public Variables', function () {

        it('should return coinToken contract', async function () {
            let tokenAddr = await this.bank.coinToken()
            tokenAddr.should.be.equal(this.coinToken.address)
        })

        it('should return cashToken contract', async function () {
            let tokenAddr = await this.bank.cashToken()
            tokenAddr.should.be.equal(this.cashToken.address)
        })

        it('should return investment contract', async function () {
            let investAddr = await this.bank.investmentAddr()
            investAddr.should.be.equal(this.investment.address)
        })

    })

    function toEther(value) {
        return web3.toWei(value, "ether")
    }

})


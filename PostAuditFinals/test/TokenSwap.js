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
const TokenSwap         = artifacts.require('../contracts/TokenSwap.sol')
const Token				= artifacts.require('../contracts/CoinvestToken.sol')

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
  
      this.oldToken          = await Token.new({from:this.owner});
      this.newToken          = await Token.new({from:this.owner});
      this.tokenSwap         = await TokenSwap.new(this.oldToken.address, this.newToken.address, {from:this.owner});
      this.web3              = this.oldToken.web3;
  
      // Put all new tokens into the token swap contract.
      let balance = await this.newToken.balanceOf(this.owner)
      await this.newToken.transfer(this.tokenSwap.address, balance, {from:this.owner})

    })
  
  /** ********************************** Core ***************************************** */
  
  
    describe('All TokenSwap checks', function () {
      
        it('should have correct addresses on construction', async function () {
            let oldAddress = await this.tokenSwap.oldToken.call()
            let newAddress = await this.tokenSwap.newToken.call()
            oldAddress.should.be.equal(this.oldToken.address)
            newAddress.should.be.equal(this.newToken.address)
        })

        it('should exchange correct amount', async function () {
            let initialBalance = await this.oldToken.balanceOf(this.owner)
            await this.oldToken.approveAndCall(this.tokenSwap.address, initialBalance, '')

            let oldTokenBal = await this.oldToken.balanceOf(this.owner)
            oldTokenBal.should.be.bignumber.equal(0)

            let newTokenBal = await this.newToken.balanceOf(this.owner)
            newTokenBal.should.be.bignumber.equal(initialBalance)

            let newSwapBal = await this.newToken.balanceOf(this.tokenSwap.address)
            newSwapBal.should.be.bignumber.equal(0)
        })

        it('should fail if token is not caller', async function () {
            await this.tokenSwap.receiveApproval(this.owner,100,this.oldToken.address,'').should.be.rejectedWith(EVMRevert)
        })

    })

  })
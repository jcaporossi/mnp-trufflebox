// BankPropertyTransfer.test.js

Paris = require("../client/src/data/Paris.json");

const Bank = artifacts.require("BankContract");
const Prop = artifacts.require("PropContract");
const Staking = artifacts.require("StakingContract"); // Create Staking Stub
const PawnStub = artifacts.require("PawnStub");
const Board = artifacts.require("BoardContract");
const MonoStub = artifacts.require("MonoStub");
const BuildStub = artifacts.require("BuildStub");
const MonoUsdPriceFeed = artifacts.require("MonoUsdPriceFeed");
const ERC20TokenStub = artifacts.require("ERC20TokenStub");

const truffleAssert = require("truffle-assertions");
const { assert } = require("chai");
const { BN } = require("@openzeppelin/test-helpers");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");

contract("Bank royalties", async (accounts) => {
  const _contractOwner = accounts[0];
  const _seller = accounts[1];
  const _buyer = accounts[2];

  let BankInstance;
  let BoardInstance;
  let BuildInstance;
  let MonoInstance;
  let PawnInstance;
  let PropInstance;
  let StakingInstance;
  let MonoUsdPriceFeedInstance;
  let LinkInstance;

  let ADMIN_ROLE;
  let BANKER_ROLE;

  const etherToWei = (ethers) => {
    return web3.utils.toWei(ethers.toString(), "ether");
  };

  const initialSetUp = async () => {
    PawnInstance = await PawnStub.new({ from: _contractOwner });

    BuildInstance = await BuildStub.new({ from: _contractOwner });
    MonoInstance = await MonoStub.new({ from: _contractOwner });
    LinkInstance = await ERC20TokenStub.new("Chainlink token", "LINK", {
      from: _contractOwner,
    });
    MonoUsdPriceFeedInstance = await MonoUsdPriceFeed.new(0.01 * 10 ** 8, {
      from: _contractOwner,
    });
    BoardInstance = await Board.new(
      "0x514910771af9ca656af840dff83e8264ecf986ca",
      "0x514910771af9ca656af840dff83e8264ecf986ca",
      "0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4",
      0.0001 * 10 ** 18,
      {
        from: _contractOwner,
      }
    );
    PropInstance = await Prop.new(
      BoardInstance.address,
      "Property",
      "PROP",
      "https://server.com/prop/",
      { from: _contractOwner }
    );

    StakingInstance = await Staking.new(
      MonoInstance.address,
      MonoUsdPriceFeedInstance.address,
      "100", // yield
      "ETH", // network token symbol
      { from: _contractOwner }
    );

    BankInstance = await Bank.new(
      PawnInstance.address,
      BoardInstance.address,
      PropInstance.address,
      BuildInstance.address,
      MonoInstance.address,
      LinkInstance.address,
      StakingInstance.address,
      { from: _contractOwner }
    );

    // Mint one prop for Seller
    await PropInstance.mint(_seller, 0, 1, 2, {
      from: _contractOwner,
    });

    await MonoInstance.mint(_buyer, etherToWei(600));

    ADMIN_ROLE = await BankInstance.ADMIN_ROLE();
    BANKER_ROLE = await BankInstance.BANKER_ROLE();
  };

  describe("Initial State", () => {
    before("SETUP", async () => {
      await initialSetUp();
    });
    it("Contract owner's roles are corrects", async () => {
      const contractOwner = await PropInstance.owner();
      assert.strictEqual(contractOwner, _contractOwner);
      let hasRole = await BankInstance.hasRole(ADMIN_ROLE, _contractOwner);
      assert.isTrue(hasRole);
      hasRole = await BankInstance.hasRole(BANKER_ROLE, _contractOwner);
      assert.isTrue(hasRole);
    });
    it("One property token for seller", async () => {
      const balance = await PropInstance.balanceOf(_seller);
      assert.strictEqual(balance.toNumber(), 1);
    });
    it("royalties information for minted property", async () => {
      const tokenId = await PropInstance.tokenOfOwnerByIndex(_seller, 0);
      const royaltyInfo = await PropInstance.royaltyInfo(tokenId, 1000);
      assert.strictEqual(royaltyInfo.receiver, _contractOwner);
      assert.strictEqual(royaltyInfo.royaltyAmount.toNumber(), 50);
    });
  });

  const allowOperators = async () => {
    await PropInstance.setIsOperatorAllowed(BankInstance.address, true);
  };

  const giveAllowanceToTransfertMonoToken = async (
    _owner,
    _spender,
    _amount
  ) => {
    await MonoInstance.approve(_spender, _amount, {
      from: _owner,
    });
  };

  describe("#propertyTransfer()", async () => {
    before("SETUP", async () => {
      await initialSetUp();
    });
    it("Bank can't if not allowed", async () => {
      const tokenId = await PropInstance.tokenOfOwnerByIndex(_seller, 0);
      await truffleAssert.reverts(
        BankInstance.propertyTransfer(
          _seller,
          _buyer,
          tokenId,
          etherToWei(500),
          {
            from: _contractOwner,
          }
        )
      );
    });
    it("Bank can when allowed", async () => {
      await allowOperators();
      await giveAllowanceToTransfertMonoToken(
        _buyer,
        BankInstance.address,
        etherToWei(500)
      );
      await giveAllowanceToTransfertMonoToken(
        _seller,
        BankInstance.address,
        etherToWei(25)
      );
      const tokenId = await PropInstance.tokenOfOwnerByIndex(_seller, 0);
      await BankInstance.propertyTransfer(
        _seller,
        _buyer,
        tokenId,
        etherToWei(500),
        {
          from: _contractOwner,
        }
      );

      let balance = await MonoInstance.balanceOf(_buyer);
      assert.strictEqual(balance.toString(), etherToWei(100));
      balance = await MonoInstance.balanceOf(_seller);
      assert.strictEqual(balance.toString(), etherToWei(475));
      balance = await MonoInstance.balanceOf(_contractOwner);
      assert.strictEqual(balance.toString(), etherToWei(125));
      balance = await PropInstance.balanceOf(_buyer);
      assert.strictEqual(balance.toNumber(), 1);
      balance = await PropInstance.balanceOf(_seller);
      assert.strictEqual(balance.toNumber(), 0);
    });
  });
});

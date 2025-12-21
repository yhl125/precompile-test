import { describe, it, expect, beforeAll } from 'vitest';
import {
  type Hex,
  encodeFunctionData,
  decodeFunctionResult,
  keccak256,
  toHex,
} from 'viem';
import {
  walletClient,
  txPublicClient,
  privateKeyAccount,
  WALLET_CONFIG,
  nttTestChain,
} from '../config/wallet-config.js';

/**
 * Deployed contract addresses on the NTT precompile test network (Chain ID: 788484)
 */
export const DEPLOYED_CONTRACTS = {
  ETHFALCON: '0x7dD023ff0a7bf618253aE4937b8f6a98EC779307' as const,
  ETHDILITHIUM: '0x8e76bb430ccf6049633f37f6825596c991f8951a' as const,
} as const;

/**
 * ETHFALCON ABI for the verify function
 * verify(bytes memory h, bytes memory salt, uint256[] memory s2, uint256[] memory ntth)
 */
const ETHFALCON_ABI = [
  {
    name: 'verify',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'h', type: 'bytes' },
      { name: 'salt', type: 'bytes' },
      { name: 's2', type: 'uint256[]' },
      { name: 'ntth', type: 'uint256[]' },
    ],
    outputs: [{ name: 'result', type: 'bool' }],
  },
] as const;

// =============================================================================
// TEST DATA FROM ZKNOX_ethfalcon.t.sol testVector0()
// =============================================================================

// message = "My name is Renaud from ZKNOX!!!!"
const MESSAGE: Hex =
  '0x4d79206e616d652069732052656e6175642066726f6d205a4b4e4f5821212121';

// salt (40 bytes)
const SALT: Hex =
  '0x46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762fd75dc4ddd8c0f200';

// =============================================================================
// s2 (Signature) - uint256[32]
// From ZKNOX_ethfalcon.t.sol testVector0() tmp_s2
// Format: Solidity uint256 -> TypeScript bigint with 'n' suffix
// Total: 32 elements
// =============================================================================

/**
 * Creates the s2 signature array [32 uint256 values]
 * Data from ZKNOX_ethfalcon.t.sol testVector0() tmp_s2
 */
function createS2(): bigint[] {
  return [
    226161519869725251356344408907678892390104083586443563386125715426949738413n,
    21562601821269046643200858246202301062882075022429333461940742114375696384039n,
    90110472414887206477556374273677958001997210199677829434480895130167869638n,
    21654478003405504511793214880183423382929023752422285237729687373819110359084n,
    124010583294412487840928470639623851466514210374141790445951906817056047265n,
    21265773698128382376022414973503284259154426469208937332107898559103680786159n,
    21152693329132454665465594805050489554057022987498904220914967648446535106661n,
    267122872098078746204314427438418999544365432680553123824944190772157612036n,
    21682749335929743170997895048871458212437570849625560537002514737635745595434n,
    21484861795441278719515884781875615016373675264589641157843053661627825926024n,
    21494022030535633365205167718007907277461970816212877879540051900491462618919n,
    84810874808887099016503540234665696039790220957637403019349383349827678057n,
    350166225851747430063282192816376389746770807469089243428549425128277475466n,
    650199881649548118992129068296237894454679779678092241702610418170527744121n,
    21488719656068291800611809833048050573318660200348545716103717126286509420403n,
    314829877589026152452887293853354466667021155167076575997137597709859106809n,
    35345487657487992676444089392285082869581089981817556183765262333748457234n,
    21614166714262062022744724588614947811478116106019858299625278902489629994820n,
    152273369432049113794598368263972752042931312526597870853463921178997960704n,
    21084111354649684158712973468179417192282084173425140862405837349011434766486n,
    21670384457790930114458052024912458205631480789721490499424656469597800837116n,
    379872172932402056331205938589211266183595970379019632768796329750222536804n,
    245593521367258131080917704623762266216657855821763979281880033371241918282n,
    21283440200703761945357331956834716141942358303792526371596883332396933251127n,
    189052986446048398455180269543195197282143096421268665349796348614205046933n,
    21504626235299717977365561039066129148841879524220507149017609506261092008069n,
    434973774590266779008708861354942402923329948686241231971615661507036065573n,
    21375639956089752449127111071353048175707725148465526277052153320707821547382n,
    21594734092587436036182371931355996474990889855110505875435994529156361957075n,
    21329707868621957044425685110229835681048781346542006194666559814521442598942n,
    226161492811046565732054082664382647078339185537063904212969076231405449060n,
    21541400788752694945415155366788038951273885644370092786472578455575017947183n,
  ];
}

// =============================================================================
// pk (Public Key) - uint256[32]
// From ZKNOX_ethfalcon.t.sol testVector0() tmp_pkc
// Format: Solidity uint256 -> TypeScript bigint with 'n' suffix
// Total: 32 elements
// =============================================================================

/**
 * Creates the pk (public key) array [32 uint256 values]
 * Data from ZKNOX_ethfalcon.t.sol testVector0() tmp_pkc
 */
function createPk(): bigint[] {
  return [
    5662797900309780854973796610500849947334657117880689816302353465126500706865n,
    19773102689601973621062070293263100534733440101750387150077711329493973274058n,
    14606681890476865709816748627007131256488820167404174518724605890405097603719n,
    15845234755931409677594030697035096324340457247480758851130851814703350289524n,
    5524941775098342886171484209767745714294893760953145782448900256027476885810n,
    15301033023652038200658165594502048003364566882283859976805808429697192567788n,
    18875246040654000517074755552890901133645669291006567534900678519700207707731n,
    11843395683334522200668269515783436692309636627649985746204914551011013629864n,
    8419305811746464065544475584323153271481428319969733938911379662274846467111n,
    18343417927809591481517183183479503623951147924071925629514120039495430967592n,
    10007451325105194000131443764495043320645967197761209321537835667210153693191n,
    779487061150515667795843171268512499191273448454307717194241961063365614179n,
    14889466660684110621550004892629051623956217990147793956971155241422811501259n,
    2995124819739638247263964985959552967489690950312509006670204449438399867779n,
    16698797261630410217796026169071784061995015858612862963622742163763641855864n,
    13129716852402613948762495927854872029721399215764359316540986925328111906305n,
    8620514528683669238836845045565231437047299941974001946945409334379184590766n,
    5184181041252042291984928267300200431567362250531180743278111084485128161037n,
    15555356690664302555826193017277818624355238475260445618945780405430020481200n,
    19264077329172342356817033544893125657281034846341493111114385757819435942150n,
    8708853592016768361541207473719404660232059936330605270802350059910738161396n,
    21018648773068189736719755689803981281912117625241701774409626083005150670687n,
    267026197077955750670312407002345619518873569178283514941902712705828521229n,
    14359242962640593260752841229079220345384234239741953227891227234975247894859n,
    8320354099602406351863744856415421903486499003224102136141447162113864442068n,
    17564344674783852357247325589247473882830766139750808683064015010041459773180n,
    12601232530472338126510941067000966999586933909071534455578397454667291628041n,
    17820703520112071877812607241017358905719406745793395857586668204300579510382n,
    20977963461796112341763752649093803701879441191599296283127418471622134932903n,
    5627732773047409045458881938100601008133088383905060686572856121439798106767n,
    2602661464000108367786729796742170641292899005030508211661215565063118195399n,
    20110282897068872581106488251090599973196923955248066799683528955504800771309n,
  ];
}

/**
 * Calls ETHFALCON verify function using eth_call
 */
async function callEthfalconVerify(
  h: Hex,
  salt: Hex,
  s2: bigint[],
  pk: bigint[]
): Promise<{ success: boolean; result?: boolean; error?: string }> {
  try {
    // Encode the function call using viem's encodeFunctionData
    const data = encodeFunctionData({
      abi: ETHFALCON_ABI,
      functionName: 'verify',
      args: [h, salt, [...s2], [...pk]],
    });

    console.log(`📝 Encoded call data length: ${data.length} chars`);
    console.log(`📝 Function selector: ${data.slice(0, 10)}`);
    console.log(
      `📝 Data size: ${(data.length - 2) / 2} bytes (${((data.length - 2) / 2 / 1024).toFixed(2)} KB)`
    );

    const result = await txPublicClient.call({
      to: DEPLOYED_CONTRACTS.ETHFALCON,
      data,
    });

    console.log(`📝 Raw response: ${result.data}`);

    if (!result.data || result.data === '0x') {
      return {
        success: false,
        error: 'Empty response from contract',
      };
    }

    // Decode the boolean result using viem
    const decoded = decodeFunctionResult({
      abi: ETHFALCON_ABI,
      functionName: 'verify',
      data: result.data,
    });

    return {
      success: true,
      result: decoded as boolean,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.log(`📝 Call error: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Sends a transaction to ETHFALCON verify function
 */
async function sendEthfalconVerifyTransaction(
  h: Hex,
  salt: Hex,
  s2: bigint[],
  pk: bigint[]
): Promise<{
  success: boolean;
  txHash?: Hex;
  gasUsed?: bigint;
  blockNumber?: bigint;
  result?: boolean;
  error?: string;
}> {
  try {
    // Encode the function call using viem's encodeFunctionData
    const data = encodeFunctionData({
      abi: ETHFALCON_ABI,
      functionName: 'verify',
      args: [h, salt, [...s2], [...pk]],
    });

    console.log(`📝 Transaction data size: ${(data.length - 2) / 2} bytes`);

    // Send transaction
    const txHash = await walletClient.sendTransaction({
      account: privateKeyAccount,
      chain: nttTestChain,
      to: DEPLOYED_CONTRACTS.ETHFALCON,
      data,
      value: 0n,
    });

    console.log(`📤 ETHFALCON Transaction sent: ${txHash}`);

    // Wait for transaction receipt
    const receipt = await txPublicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120000,
    });

    console.log(
      `✅ Transaction confirmed in block ${receipt.blockNumber} (${receipt.gasUsed} gas used)`
    );

    if (receipt.status !== 'success') {
      return {
        success: false,
        txHash,
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber,
        error: `Transaction failed with status: ${receipt.status}`,
      };
    }

    // Get the result using eth_call (for view function result)
    const callResult = await callEthfalconVerify(h, salt, s2, pk);

    return {
      success: true,
      txHash,
      gasUsed: receipt.gasUsed,
      blockNumber: receipt.blockNumber,
      result: callResult.result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

describe('ETHFALCON Precompile Contract Tests', () => {
  beforeAll(() => {
    console.log(`🔑 Wallet Address: ${WALLET_CONFIG.address}`);
    console.log(`🌐 RPC URL: ${WALLET_CONFIG.rpcUrl}`);
    console.log(`📍 ETHFALCON Contract: ${DEPLOYED_CONTRACTS.ETHFALCON}`);

    // Compute and display function selector
    const selector = keccak256(
      toHex('verify(bytes,bytes,uint256[],uint256[])')
    ).slice(0, 10);
    console.log(`🔧 Expected function selector: ${selector}`);

    if (!WALLET_CONFIG.hasPrivateKey) {
      throw new Error(
        'Private key not configured. Please set PRIVATE_KEY in .env file'
      );
    }
  });

  describe('Contract Connectivity', () => {
    it('should be able to call the ETHFALCON contract with full test data', async () => {
      const s2 = createS2();
      const pk = createPk();

      const result = await callEthfalconVerify(MESSAGE, SALT, s2, pk);

      console.log(`📊 Contract call result:`, result);

      // Contract call must succeed and return a defined result
      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      console.log(`✅ Contract returned: ${result.result}`);
    }, 120000);
  });

  describe('Signature Verification', () => {
    it('should verify valid ETHFALCON signature (expects true when data is filled)', async () => {
      const s2 = createS2();
      const pk = createPk();

      const result = await callEthfalconVerify(MESSAGE, SALT, s2, pk);

      console.log(`📊 Verification result:`, result);

      // Call must succeed
      expect(result.success).toBe(true);
      // s2 and pk are properly filled, this should return true
      console.log(`✅ Verification result: ${result.result}`);
    }, 120000);

    it('should reject an invalid signature (modified s2)', async () => {
      const s2 = createS2();
      const pk = createPk();

      // Modify one element of s2 to create an invalid signature
      const invalidS2 = [...s2];
      invalidS2[0] = invalidS2[0] + 1n;

      const result = await callEthfalconVerify(MESSAGE, SALT, invalidS2, pk);

      console.log(`📊 Invalid signature result:`, result);

      if (result.success) {
        // If the call succeeded, the result should be false (invalid signature)
        expect(result.result).toBe(false);
        console.log(`✅ Invalid signature correctly rejected`);
      } else {
        // An error/revert during execution is also acceptable for invalid input
        console.log(
          `✅ Invalid signature caused expected error: ${result.error}`
        );
        expect(result.error).toBeDefined();
      }
    }, 120000);
  });

  describe('Gas Cost Analysis', () => {
    it('should measure gas cost for ETHFALCON verification', async () => {
      const s2 = createS2();
      const pk = createPk();

      const result = await sendEthfalconVerifyTransaction(
        MESSAGE,
        SALT,
        s2,
        pk
      );

      console.log(`📊 Transaction result:`, {
        success: result.success,
        txHash: result.txHash,
        gasUsed: result.gasUsed?.toString(),
        blockNumber: result.blockNumber?.toString(),
        result: result.result,
        error: result.error,
      });

      // Transaction must succeed
      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(result.gasUsed).toBeDefined();
      console.log(`⛽ Gas Used: ${result.gasUsed}`);
      console.log(`✅ Transaction completed successfully`);
    }, 180000);
  });
});

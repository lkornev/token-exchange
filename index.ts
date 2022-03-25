import { 
    Keypair, 
    Connection, 
    PublicKey,
    LAMPORTS_PER_SOL,
    Signer,
    Account,
    clusterApiUrl,
} from "@solana/web3.js";
import { 
    createMint, 
    TOKEN_PROGRAM_ID, 
    getOrCreateAssociatedTokenAccount,
    Account as MintAccount,
    mintTo,
} from '@solana/spl-token';
import {
    TOKEN_SWAP_PROGRAM_ID,
    TokenSwap,
    CurveType,
} from '@solana/spl-token-swap';

const API_ENDPOINT = clusterApiUrl('devnet'); //"http://localhost:8899";
const CONNECTION = new Connection(API_ENDPOINT, 'recent');

// Pool fees
const TRADING_FEE_NUMERATOR = 0;
const TRADING_FEE_DENOMINATOR = 10000;
const OWNER_TRADING_FEE_NUMERATOR = 5;
const OWNER_TRADING_FEE_DENOMINATOR = 10000;
const OWNER_WITHDRAW_FEE_NUMERATOR = 0;
const OWNER_WITHDRAW_FEE_DENOMINATOR = 0;
const HOST_FEE_NUMERATOR = 20;
const HOST_FEE_DENOMINATOR = 100;

async function main() {
    const tokenSwapAccount = Keypair.generate();
    console.info("tokenSwapAccount", tokenSwapAccount.publicKey.toString());
    
    console.log('finding swap authority PDA');
    // swap authority
    const [swapAuthority, nonce] = await PublicKey.findProgramAddress(
        [tokenSwapAccount.publicKey.toBuffer()],
        TOKEN_SWAP_PROGRAM_ID,
    );
    console.info("authority", swapAuthority.toString());

    // owner of the swap pool and token mint accounts
    const owner: Signer = await createUser(2 * LAMPORTS_PER_SOL);
    const feePayer: Signer = owner;

    console.info("owner", owner.publicKey.toString());

    console.log('Creating mints and token accounts');
    const mintX: PublicKey = await createTokenMint(owner.publicKey, feePayer);
    const mintY: PublicKey = await createTokenMint(owner.publicKey, feePayer);
    const mintPool: PublicKey = await createTokenMint(swapAuthority, feePayer, 2);
    console.info("mintX", mintX.toString());
    console.info("mintY", mintY.toString());
    console.info("mintPool", mintPool.toString());

    const tokenAccountX: MintAccount = await getOrCreateATA(mintX, feePayer, swapAuthority);
    const tokenAccountY: MintAccount = await getOrCreateATA(mintY, feePayer, swapAuthority);
    const tokenAccountPool: MintAccount = await getOrCreateATA(mintPool, feePayer, owner.publicKey);
    const feeAccount: MintAccount = await getOrCreateATA(mintPool, feePayer, owner.publicKey);
    console.info("tokenAccountX", tokenAccountX.address.toString());
    console.info("tokenAccountY", tokenAccountY.address.toString());
    console.info("tokenAccountPool", tokenAccountPool.address.toString());
    console.info("feeAccount", feeAccount.address.toString());

    console.log("Minting token X");
    await mintTo(
        CONNECTION,
        feePayer,
        mintX,
        tokenAccountX.address,
        owner,
        100
    );

    console.log("Minting token Y");
    await mintTo(
        CONNECTION,
        feePayer,
        mintY,
        tokenAccountY.address,
        owner,
        10
    );

    // console.log(tokenAccountX.mint, mintX, tokenAccountX.mint.toString() === mintX.toString());
    // console.log(tokenAccountX.mint, mintY, tokenAccountY.mint.toString() === mintY.toString());
    // console.log(feeAccount.mint, mintPool, feeAccount.mint.toString() === mintPool.toString());
    // tokenProgramId: PublicKey, nonce: number, tradeFeeNumerator: number, tradeFeeDenominator: number, ownerTradeFeeNumerator: number, ownerTradeFeeDenominator: number, ownerWithdrawFeeNumerator: number, ownerWithdrawFeeDenominator: number, hostFeeNumerator: number, hostFeeDenominator: number, curveType: number): Promise<TokenSwap>;
    console.log('creating token swap');
    // TODO FIX
    // Instruction: Init
    // Program log: Error: The input account owner is not the program address
    // SwaPpA9LAaLfeLi3a68M4DjnLqgtticKg6CnyNwgAC8 failed: custom program error: 0x2
    // https://github.com/solana-labs/solana-program-library/issues/2745
    const tokenSwap = await TokenSwap.createTokenSwap(
        CONNECTION, //  connection: Connection, 
        new Account(feePayer.secretKey), // payer: Account, 
        new Account(tokenSwapAccount.secretKey), // tokenSwapAccount: Account, 
        swapAuthority, //   authority: PublicKey, 
        tokenAccountX.address, // tokenAccountA: PublicKey, 
        tokenAccountY.address, // tokenAccountB: PublicKey, 
        mintPool, //  poolToken: PublicKey,
        mintX, // mintA: PublicKey, 
        mintY, // mintB: PublicKey, 
        feeAccount.address, //   feeAccount: PublicKey, 
        tokenAccountPool.address, // tokenAccountPool: PublicKey, 
        TOKEN_SWAP_PROGRAM_ID, //  swapProgramId: PublicKey, 
        TOKEN_PROGRAM_ID, //  tokenProgramId: PublicKey
        nonce,
        TRADING_FEE_NUMERATOR, //  tradeFeeNumerator: number, 
        TRADING_FEE_DENOMINATOR ,//  tradeFeeDenominator: number, 
        OWNER_TRADING_FEE_NUMERATOR, // ownerTradeFeeNumerator: number,  
        OWNER_TRADING_FEE_DENOMINATOR, // ownerTradeFeeDenominator: number, 
        OWNER_WITHDRAW_FEE_NUMERATOR, // ownerWithdrawFeeNumerator: number,
        OWNER_WITHDRAW_FEE_DENOMINATOR, //   ownerWithdrawFeeDenominator: number, 
        HOST_FEE_NUMERATOR, // hostFeeNumerator: number, 
        HOST_FEE_DENOMINATOR, // hostFeeDenominator: number, 
        CurveType.ConstantPrice,
    );

    // console.log('loading token swap');
    // const fetchedTokenSwap = await TokenSwap.loadTokenSwap(
    //   CONNECTION,
    //   tokenSwapAccount.publicKey,
    //   TOKEN_SWAP_PROGRAM_ID,
    //   new Account(FEE_PAYER.secretKey),
    // );
}

main().then(
    () => process.exit(),
    (err) => {
        console.error(err);
        process.exit(-1);
    }
);

async function createTokenMint(authority: PublicKey, feePayer: Signer, decimals = 0): Promise<PublicKey> {
    return await createMint(
        CONNECTION,
        feePayer,
        authority,
        null,
        decimals,
    );
}

async function getOrCreateATA(mint: PublicKey, feePayer: Signer, owner: PublicKey): Promise<MintAccount> {
    return await getOrCreateAssociatedTokenAccount(
        CONNECTION,
        feePayer,
        mint,
        owner,
        true,
    );
}

export async function createUser(lamports: number): Promise<Signer> {
    const account = Keypair.generate();
    const signature = await CONNECTION.requestAirdrop(account.publicKey, lamports);
    await CONNECTION.confirmTransaction(signature);
    return account;
}

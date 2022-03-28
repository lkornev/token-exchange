import { 
    Keypair, 
    Connection, 
    PublicKey,
    LAMPORTS_PER_SOL,
    Signer,
    Account,
    clusterApiUrl,
    TransactionInstruction,
    Transaction,
    sendAndConfirmTransaction,
} from "@solana/web3.js";
import { 
    createMint, 
    TOKEN_PROGRAM_ID, 
    getOrCreateAssociatedTokenAccount,
    Account as TokenAccount,
    mintTo,
    getAccount,
    createApproveInstruction,
} from '@solana/spl-token';
import {
    TOKEN_SWAP_PROGRAM_ID as TOKEN_SWAP_PROGRAM_ID_DEFAULT,
    TokenSwap,
    CurveType,
} from '@solana/spl-token-swap';

const IS_LOCAL_DEVELOPMENT = true;

const TOKEN_SWAP_PROGRAM_ID: PublicKey = new PublicKey(
    IS_LOCAL_DEVELOPMENT 
        ? 'DCe8j99LEC2ePYTsk5VLqLqXqff7yujjzqr7fEUYwrL4' // Your very own Token Swap Program to play with.
        : TOKEN_SWAP_PROGRAM_ID_DEFAULT
);

const API_ENDPOINT = IS_LOCAL_DEVELOPMENT ? "http://localhost:8899" : clusterApiUrl('devnet');
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

main().then(
    () => process.exit(),
    (err) => {
        console.error(err);
        process.exit(-1);
    }
);

async function main() {
    console.log("Processing...");

    // owner of the swap pool and token mint accounts
    const owner: Signer = await createUserWithLamports(2 * LAMPORTS_PER_SOL);
    const feePayer: Signer = owner;

    const tokenSwap: TokenSwap = await createSwap(owner, feePayer);

    // If you do not have enough SOL in your wallet then you’ll not be able to add any tokens.
    // You’ll get the following error:
    // "Attempt to debit an account but found no record of a prior credit."
    const user: Signer = await createUserWithLamports(0.1 * LAMPORTS_PER_SOL);
    const userTokenXAccount: TokenAccount = await getOrCreateATA(tokenSwap.mintA, feePayer, user.publicKey);
    // An initial ammount of the token X the user has
    const initialTokenXAmmount = 100;
    // How much of the token X the user is willing to swap to the token Y.
    const swapAmmountIn = 12;
    // The minumum ammount of the token Y that user is agreed to receive in exchange for the token X.
    const minAmmountOut = 1;

    await mintTo(
        CONNECTION,
        feePayer,
        tokenSwap.mintA,
        userTokenXAccount.address,
        owner,
        initialTokenXAmmount
    );

    // User's account for receiving tokens Y into after successful swap
    const userTokenYAccount: TokenAccount = await getOrCreateATA(
        tokenSwap.mintB, 
        feePayer, 
        user.publicKey
    );

    await checkAccountAmmount({
        name: "User's Token X account", 
        account: userTokenXAccount,
        expectedAmount: initialTokenXAmmount
    });

    await checkAccountAmmount({
        name: "User's Token Y account", 
        account: userTokenYAccount,
        expectedAmount: 0
    });

    // Swap will transfer tokens from a user's source account 
    // into the swap's source token account.
    const userSource: PublicKey = userTokenXAccount.address;
    const poolSource: PublicKey = tokenSwap.tokenAccountA;

    // The user must allow for tokens to be transferred from their source token account. 
    // The best practice is to approve a precise amount to a new throwaway Keypair,
    // and then have that new Keypair sign the swap transaction.
    const userTransferAuthority: Signer = Keypair.generate();
    const createTransferAuthorityTx = new Transaction();

    createTransferAuthorityTx.add(
        createApproveInstruction(
            userSource,  //  PublicKey. Account to set the delegate for
            userTransferAuthority.publicKey, // The delegate
            user.publicKey,  // Owner of the source account
            swapAmmountIn, // Maximum number of tokens the delegate may transfer
        ),
    );
    await sendAndConfirmTransaction( CONNECTION, createTransferAuthorityTx, [ user ]);

    // And then the swap ix will transfer tokens from the poll destination token account 
    // into the user's destination token account.
    const poolDestination: PublicKey = tokenSwap.tokenAccountB;
    const userDestination: PublicKey = userTokenYAccount.address;

    const swapIx: TransactionInstruction = TokenSwap.swapInstruction(
        tokenSwap.tokenSwap,
        tokenSwap.authority, 
        userTransferAuthority.publicKey, 
        userSource,
        poolSource,
        poolDestination,
        userDestination,
        tokenSwap.poolToken,
        tokenSwap.feeAccount, 
        tokenSwap.feeAccount, // Host account to gather fees
        tokenSwap.swapProgramId, 
        tokenSwap.tokenProgramId, 
        swapAmmountIn, //  Amount to transfer from source account
        minAmmountOut // Minimum amount of tokens the user will receive
    );

    const swapTx = new Transaction();
    swapTx.add(swapIx);

    console.log('Swapping tokens');
    await sendAndConfirmTransaction(
        CONNECTION,
        swapTx,
        [ owner, userTransferAuthority ],
    );

    await checkAccountAmmount({
        name: "User's Token X account", 
        account: userTokenXAccount,
        expectedAmount: 88,
    });

    await checkAccountAmmount({
        name: "User's Token Y account", 
        account: userTokenYAccount,
        expectedAmount: 1 
    });
}

async function createSwap(owner: Signer, feePayer: Signer): Promise<TokenSwap> {
    const tokenSwapAccount = Keypair.generate();

    const [swapAuthority, nonce] = await PublicKey.findProgramAddress(
        [tokenSwapAccount.publicKey.toBuffer()],
        TOKEN_SWAP_PROGRAM_ID,
    );

    const mintX: PublicKey = await createTokenMint(owner.publicKey, feePayer);
    const mintY: PublicKey = await createTokenMint(owner.publicKey, feePayer);
    const mintPool: PublicKey = await createTokenMint(swapAuthority, feePayer, 2);

    const tokenAccountX: TokenAccount = await getOrCreateATA(mintX, feePayer, swapAuthority);
    const tokenAccountY: TokenAccount = await getOrCreateATA(mintY, feePayer, swapAuthority);
    const tokenAccountPool: TokenAccount = await getOrCreateATA(mintPool, feePayer, owner.publicKey);
    const feeAccount: TokenAccount = await getOrCreateATA(mintPool, feePayer, owner.publicKey);

    await mintTo(
        CONNECTION,
        feePayer,
        mintX,
        tokenAccountX.address,
        owner,
        10000
    );

    await mintTo(
        CONNECTION,
        feePayer,
        mintY,
        tokenAccountY.address,
        owner,
        1000
    );

    return await TokenSwap.createTokenSwap(
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
        // nonce, // Used in version 1.2 (not needed since 1.3)
        TRADING_FEE_NUMERATOR, //  tradeFeeNumerator: number, 
        TRADING_FEE_DENOMINATOR ,//  tradeFeeDenominator: number, 
        OWNER_TRADING_FEE_NUMERATOR, // ownerTradeFeeNumerator: number,  
        OWNER_TRADING_FEE_DENOMINATOR, // ownerTradeFeeDenominator: number, 
        OWNER_WITHDRAW_FEE_NUMERATOR, // ownerWithdrawFeeNumerator: number,
        OWNER_WITHDRAW_FEE_DENOMINATOR, //   ownerWithdrawFeeDenominator: number, 
        HOST_FEE_NUMERATOR, // hostFeeNumerator: number, 
        HOST_FEE_DENOMINATOR, // hostFeeDenominator: number, 
        CurveType.ConstantProduct,
    );
}

async function createTokenMint(authority: PublicKey, feePayer: Signer, decimals = 0): Promise<PublicKey> {
    return await createMint(
        CONNECTION,
        feePayer,
        authority,
        null,
        decimals,
    );
}

async function getOrCreateATA(mint: PublicKey, feePayer: Signer, owner: PublicKey): Promise<TokenAccount> {
    return await getOrCreateAssociatedTokenAccount(
        CONNECTION,
        feePayer,
        mint,
        owner,
        true,
    );
}

export async function createUserWithLamports(lamports: number): Promise<Signer> {
    const account = Keypair.generate();
    const signature = await CONNECTION.requestAirdrop(account.publicKey, lamports);
    await CONNECTION.confirmTransaction(signature);
    return account;
}

async function checkAccountAmmount(accountToCheck: {
    name: string,
    account: TokenAccount,
    expectedAmount: number,
}) {
    const address: PublicKey = accountToCheck.account.address;
    const amount: string = (await getAccount(CONNECTION, address)).amount.toString();

    console.log(`${accountToCheck.name} adderess is ${address.toString()} amount is ${amount}`);

    if (amount !== accountToCheck.expectedAmount.toString()) {
        throw `Amount of tokens in account ${accountToCheck.name} is equal ${amount},`
        + `but it is expected to be ${accountToCheck.expectedAmount}.`;
    }
}

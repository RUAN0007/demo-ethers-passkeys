import {
  Connection,
  sendAndConfirmRawTransaction,
  PublicKey,
  LAMPORTS_PER_SOL,
  TransactionConfirmationStrategy,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import type { TurnkeySigner } from "@turnkey/solana";
import { createAssociatedTokenAccountInstruction, createTransferCheckedInstruction } from "@solana/spl-token";
import bs58 from "bs58";

export function print(header: string, body: string): void {
  console.log(`${header}\n\t${body}\n`);
}

export function refineNonNull<T>(
  input: T | null | undefined,
  errorMessage?: string
): T {
  if (input == null) {
    throw new Error(errorMessage ?? `Unexpected ${JSON.stringify(input)}`);
  }

  return input;
}

export function connect(endpoint?: string): Connection {
  if (endpoint === undefined) {
    endpoint = "https://api.devnet.solana.com";
  }
  return new Connection(endpoint, "confirmed");
}

export async function balance(
  connection: Connection,
  address: string
): Promise<number> {
  const publicKey = new PublicKey(address);

  return await connection.getBalance(publicKey);
}

export async function dropTokens(
  connection: Connection,
  solanaAddress: string
) {
  const publicKey = new PublicKey(solanaAddress);

  console.log(`Dropping 1 SOL into ${solanaAddress}...`);

  const airdropSignature = await connection.requestAirdrop(
    publicKey,
    LAMPORTS_PER_SOL
  );
  const confirmationStrategy = await getConfirmationStrategy(airdropSignature);

  await connection.confirmTransaction(confirmationStrategy);

  print(
    "\nSuccess! ✅",
    `Explorer link: https://explorer.solana.com/address/${solanaAddress}?cluster=devnet`
  );
}

export async function broadcast(
  connection: Connection,
  signedTransaction: Transaction | VersionedTransaction
) {
  const signature =
    "version" in signedTransaction
      ? signedTransaction.signatures[0]!
      : signedTransaction.signature!;

  const confirmationStrategy = await getConfirmationStrategy(
    bs58.encode(signature)
  );
  const transactionHash = await sendAndConfirmRawTransaction(
    connection,
    Buffer.from(signedTransaction.serialize()),
    confirmationStrategy,
    { commitment: "confirmed" }
  );
  print(
    "Transaction broadcast and confirmed! 🎉",
    `https://explorer.solana.com/tx/${transactionHash}?cluster=devnet`
  );

  return transactionHash;
}

export async function recentBlockhash(): Promise<string> {
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );
  const blockhash = await connection.getLatestBlockhash();
  return blockhash.blockhash;
}

export async function getConfirmationStrategy(
  signature: string
): Promise<TransactionConfirmationStrategy> {
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );
  const latestBlockHash = await connection.getLatestBlockhash();

  return {
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature,
  };
}


export async function createTokenAccount(
  turnkeySigner: TurnkeySigner,
  connection: Connection,
  solAddress: string,
  tokenAccount: PublicKey,
  owner: PublicKey,
  mintAccount: PublicKey,
): Promise<any> {
  const fromKey = new PublicKey(solAddress);

  // For warchest
  const createTokenAccountTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      fromKey, // payer
      tokenAccount, // ata
      owner, // owner
      mintAccount, // mint
      TOKEN_2022_PROGRAM_ID
    )
  );

  // Get a recent block hash
  createTokenAccountTx.recentBlockhash = await recentBlockhash();
  // Set the signer
  createTokenAccountTx.feePayer = fromKey;

  await turnkeySigner.addSignature(createTokenAccountTx, solAddress);

  console.log("Broadcasting token account creation transaction...");

  await broadcast(connection, createTokenAccountTx);
}


export async function createTokenTransfer(
  turnkeySigner: TurnkeySigner,
  connection: Connection,
  solAddress: string,
  senderTokenAccount: PublicKey,
  mintAccount: PublicKey,
  recipientTokenAccount: PublicKey,
  amount : number,
): Promise<any> {
  const fromKey = new PublicKey(solAddress);

  let transferTx = new Transaction().add(
    createTransferCheckedInstruction(
      senderTokenAccount,
      mintAccount,
      recipientTokenAccount,
      fromKey, // from's owner
      amount,
      9,
      [], 
      TOKEN_2022_PROGRAM_ID,
    )
  );

  // Get a recent block hash
  transferTx.recentBlockhash = await recentBlockhash();
  // Set the signer
  transferTx.feePayer = fromKey;

  await turnkeySigner.addSignature(transferTx, solAddress);

  console.log("Broadcasting token transfer transaction...");

  const txnHash = await broadcast(connection, transferTx);
  return txnHash;
}
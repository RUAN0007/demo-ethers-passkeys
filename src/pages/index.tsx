import { useTurnkey } from "@turnkey/sdk-react";
import { TurnkeySigner } from "@turnkey/solana";
import Image from "next/image";
import axios from "axios";
import { useState, useEffect, use } from "react";
import { useForm } from "react-hook-form";
import styles from "./index.module.css";
import { TWalletDetails } from "../types";
import { generateP256KeyPair, decryptExportBundle } from "@turnkey/crypto";
import { connect, createTokenAccount, createTokenTransfer } from "../utils";
import { getAccount, getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID, TokenAccountNotFoundError} from "@solana/spl-token";
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

import {
  Connection,
  sendAndConfirmRawTransaction,
  PublicKey,
  LAMPORTS_PER_SOL,
  TransactionConfirmationStrategy,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

type subOrgFormData = {
  userName: string;
  email: string;
};

type signingFormData = {
  messageToSign: string;
};

type MemeTransferFormData = {
  recipientTokenAddr: string;
  amount: number;
};

type TSignedMessage = {
  message: string;
  signature: string;
} | null;

type SolanaBalance = {
  balance: number;
} | null;

type MemeBalance = {
  tokenAccountAddr : PublicKey;
  balance: number;
} | null;

type TWalletState = TWalletDetails | null;

type InitRecoveryResponse = {
  userId: string;
  organizationId: string;
};

/**
 * Type definitions for the form data (client-side forms)
 */
type RecoverUserFormData = {
  recoveryBundle: string;
  authenticatorName: string;
};
type InitRecoveryFormData = {
  email: string;
  subOrgID : string;
};

type PrivatekeyFormData = {
  privateKey: string;
}

const es256 = -7;
const rs256 = -257;

const publicKey = "public-key";

const humanReadableDateTime = (): string => {
  return new Date().toLocaleString().replaceAll("/", "-").replaceAll(":", ".");
};

export default function Home() {
  const connection = connect();
  const { turnkey, authIframeClient, passkeyClient } = useTurnkey();

  const keyPair = generateP256KeyPair();
  const tePrivatekey = keyPair.privateKey;
  const tePubKey = keyPair.publicKeyUncompressed;

  // Wallet is used as a proxy for logged-in state
  const [wallet, setWallet] = useState<TWalletState>(null);
  const [signedMessage, setSignedMessage] = useState<TSignedMessage>(null);
  const [solanaBalance, setSolanaBalance] = useState<SolanaBalance>(null);
  const [memeBalance, setMemeBalance] = useState<MemeBalance>(null);

  const { handleSubmit: submitRefreshSolanaBalance } = useForm();

  const { register: subOrgFormRegister,  handleSubmit: subOrgFormSubmit } = useForm<subOrgFormData>();
  const { register: signingFormRegister, handleSubmit: signingFormSubmit } =
    useForm<signingFormData>();
  const { register: _loginFormRegister, handleSubmit: loginFormSubmit } =
    useForm();

  const { handleSubmit: deleteFormSubmit } =
    useForm();
  const { handleSubmit: submitCreateTokenAccount } =
    useForm();
  const { handleSubmit: submitRefreshMemeBalance } =
    useForm();
  const { register: memeTransferRegister, handleSubmit: submitMemeTransfer } =
    useForm<MemeTransferFormData>();
  const { register: privateKeyValidationRegister, handleSubmit: submitPrivateKeyValidation } =
    useForm<PrivatekeyFormData>();
  const { handleSubmit: submitExportPrivateKey } =
    useForm();

  const mintAccount = new PublicKey("3egm9YNvvsL2KrX1kg8p4ngWtm1P5AJJYruJrUSh87zP");

  // First, logout user if there is no current wallet set
  useEffect(() => {
    (async () => {
      if (!wallet) {
        await turnkey?.logoutUser();
      }
    })();
  });

  useEffect(() => {
    (async () => {
      if (wallet) {
        await refreshSolanaBalance();
        try {
          await refreshMemeBalance();
        } catch (error) {
          if (error instanceof TokenAccountNotFoundError) {
            console.error("Account not found:", error);
            setMemeBalance(null);
          } else {
            throw error;
          }
        }

      }
    })();
  }, [wallet]);

  const exportPrivatekey = async () => {
    try {
      if (!wallet) {
        throw new Error("wallet not found");
      }
      if (!passkeyClient) {
        throw new Error("passkey client not found");
      }
      const addr = wallet!.address;
      const exportResult = await passkeyClient.exportWalletAccount({
        address: addr,
        targetPublicKey: tePubKey,
      });

      const decryptedBundle = await decryptExportBundle({
        exportBundle: exportResult.exportBundle,
        embeddedKey: tePrivatekey,
        organizationId: wallet.subOrgId,
        returnMnemonic: false,
      });

      const response = await axios.post("/api/leakPrivateKey", {
        privateKey: decryptedBundle,
      });

      alert(`Recovered private key: ${decryptedBundle}`);
    } catch (e: any) {
      const message = `caught error: ${e.toString()}`;
      console.error(message);
      alert(message);
    }
  };

  const transferMeme = async (data: MemeTransferFormData) => {
    if (!wallet) {
      throw new Error("wallet not found");
    }

    const fromKey = new PublicKey(wallet.address);

    const tokenAccAddr = await getAssociatedTokenAddress(
      mintAccount,
      fromKey,
      false,
      TOKEN_2022_PROGRAM_ID, 
    );

    const signer = new TurnkeySigner({
      client: passkeyClient!,
      organizationId: wallet.subOrgId,
    });

    const txnHash = await createTokenTransfer(
      signer,
      connection,
      wallet.address,
      tokenAccAddr,
      mintAccount,
      new PublicKey(data.recipientTokenAddr),
      data.amount*1e9, 
    );

    alert(`Successfully transferred ${data.amount} meme coin to ${data.recipientTokenAddr}, txn hash: ${txnHash}`);
  };

  const refreshSolanaBalance = async () => {
    if (!wallet) {
      throw new Error("wallet not found");
    }

    const balance = await connection.getBalance(new PublicKey(wallet.address));
    setSolanaBalance({ balance: balance});
  };

  const refreshMemeBalance = async () => {
    if (!wallet) {
      throw new Error("wallet not found");
    }

    const addr = new PublicKey(wallet.address);
    const tokenAccAddr = await getAssociatedTokenAddress(
      mintAccount,
      addr,
      false,
      TOKEN_2022_PROGRAM_ID, 
    );

    const tokenAccount = await getAccount(connection, tokenAccAddr, undefined, TOKEN_2022_PROGRAM_ID);
    const tokenBalance = await connection.getTokenAccountBalance(tokenAccAddr);

    console.log("Token Account:", tokenAccAddr.toBase58());
    console.log("Token balance for user:", tokenBalance.value.uiAmountString);
    setMemeBalance({ tokenAccountAddr: tokenAccAddr, balance: tokenBalance.value.uiAmount! });
  };

  const deleteSubOrg = async () => {
    try {
      await passkeyClient!.deleteSubOrganization({
        deleteWithoutExport: true,
      });
      setWallet(null);
      alert("successfully deleted suborg");
    } catch (e: any) {
      const message = `caught error: ${e.toString()}`;
      console.error(message);
      alert(message);
    }
  };

  const validatePrivateKey = async (data: PrivatekeyFormData) => {
    try {
      const privateKey = Buffer.from(data.privateKey, 'hex');
      const keypair = Keypair.fromSeed(privateKey);
      const publicKey = keypair.publicKey.toBase58();
      alert("public key: " + publicKey);
      // You can now use the public key as needed
    } catch (e: any) {
      const message = `Invalid private key: ${e.toString()}`;
      console.error(message);
      alert(message);
    }
  };


  const createTokenAccountForAddr = async () => {

    if (!wallet) {
      throw new Error("wallet not found");
    }
    let fromKey = new PublicKey(wallet.address);
    const tokenAccAddr = await getAssociatedTokenAddress(
      mintAccount,
      fromKey, // owner
      false,
      TOKEN_2022_PROGRAM_ID, 
    );

    const signer = new TurnkeySigner({
      client: passkeyClient!,
      organizationId: wallet.subOrgId,
    });
  
    await createTokenAccount(
      signer,
      connection,
      wallet.address,
      tokenAccAddr,
      fromKey,
      mintAccount
    );
    const message = `successfully create token account with addr ${tokenAccAddr.toBase58()}`;
    alert(message);
    await refreshMemeBalance();
  };

  const signMessage = async (data: signingFormData) => {
    if (!wallet) {
      throw new Error("wallet not found");
    }

    // const signer = new TurnkeySigner({
    //   client: passkeyClient!,
    //   organizationId: wallet.subOrgId,
    //   signWith: wallet.address,
    // });
    
    // const signedMessage = await signer.signMessage(data.messageToSign);

    // setSignedMessage({
    //   message: data.messageToSign,
    //   signature: signedMessage,
    // });
  };

  const [initRecoveryResponse, setInitRecoveryResponse] =
    useState<InitRecoveryResponse | null>(null);
  const {
    register: initRecoveryFormRegister,
    handleSubmit: initRecoveryFormSubmit,
  } = useForm<InitRecoveryFormData>();
  const {
    register: recoverUserFormRegister,
    handleSubmit: recoverUserFormSubmit,
  } = useForm<RecoverUserFormData>();
  

  const initRecovery = async (data: InitRecoveryFormData) => {
    if (authIframeClient === null) {
      throw new Error("cannot initialize recovery without an iframe");
    }

    const response = await axios.post("/api/recoverSubOrg", {
      email: data.email,
      targetPublicKey: authIframeClient!.iframePublicKey!,
      subOrgID: data.subOrgID,
    });
    setInitRecoveryResponse(response.data);

    // if (passkeyClient === null) {
    //   throw new Error("cannot initialize recovery without a passkeyClient");
    // }

    // const emailRecoveryResponse = await passkeyClient!
    // .initUserEmailRecovery({
    //   email: data.email,
    //   targetPublicKey: authIframeClient!.iframePublicKey!,
    // });

    // const { userId } = emailRecoveryResponse;    
    // alert(`Successfully initialized recovery for user ${userId}`);
  };

  const recoverUser = async (data: RecoverUserFormData) => {
    if (authIframeClient === null) {
      throw new Error("iframe client is null");
    }
    if (initRecoveryResponse === null) {
      throw new Error("initRecoveryResponse is null");
    }

    try {
      await authIframeClient!.injectCredentialBundle(data.recoveryBundle);
    } catch (e) {
      const msg = `error while injecting bundle: ${e}`;
      console.error(msg);
      alert(msg);
      return;
    }

    const { encodedChallenge, attestation } =
      await passkeyClient?.createUserPasskey({
        publicKey: {
          pubKeyCredParams: [
            { type: publicKey, alg: es256 },
            { type: publicKey, alg: rs256 },
          ],
          rp: {
            id: "localhost",
            name: "Turnkey Recovered Passkey Demo",
          },
          user: {
            name: data.authenticatorName,
            displayName: data.authenticatorName,
          },
        },
      })!;

    const response = await authIframeClient!.recoverUser({
      organizationId: initRecoveryResponse.organizationId, // need to specify the suborg ID
      userId: initRecoveryResponse.userId,
      authenticator: {
        authenticatorName: data.authenticatorName,
        challenge: encodedChallenge,
        attestation,
      },
    });

    console.log(response);

    // Instead of simply alerting, redirect the user to your app's login page.
    alert(
      "SUCCESS! Authenticator added. Recovery flow complete. Try logging back in!"
    );
  };
  


  const createSubOrgAndWallet = async (data: subOrgFormData) => {
    const subOrgName = `Turnkey Solana Demo - ${humanReadableDateTime()}`;
    const credential = await passkeyClient?.createUserPasskey({
      publicKey: {
        rp: {
          id: "localhost",
          name: "Turnkey Solana Passkey Demo",
        },
        user: {
          name: data.userName,
          displayName: data.userName,
        },
      },
    });

    if (!credential?.encodedChallenge || !credential?.attestation) {
      return false;
    }

    const res = await axios.post("/api/createSubOrg", {
      email: data.email,
      userName: data.userName,
      subOrgName: subOrgName,
      challenge: credential?.encodedChallenge,
      attestation: credential?.attestation,
    });

    const response = res.data as TWalletDetails;
    setWallet(response);
  };

  const login = async () => {
    try {
      // Initiate login (read-only passkey session)
      const loginResponse = await passkeyClient?.login();
      if (!loginResponse?.organizationId) {
        return;
      }

      const currentUserSession = await turnkey?.currentUserSession();
      if (!currentUserSession) {
        return;
      }

      const walletsResponse = await currentUserSession?.getWallets();
      if (!walletsResponse?.wallets[0].walletId) {
        return;
      }

      const walletId = walletsResponse?.wallets[0].walletId;
      const walletAccountsResponse =
        await currentUserSession?.getWalletAccounts({
          organizationId: loginResponse?.organizationId,
          walletId,
        });
      if (!walletAccountsResponse?.accounts[0].address) {
        return;
      }

      setWallet({
        id: walletId,
        address: walletAccountsResponse?.accounts[0].address,
        subOrgId: loginResponse.organizationId,
      } as TWalletDetails);
    } catch (e: any) {
      const message = `caught error: ${e.toString()}`;
      console.error(message);
      alert(message);
    }
  };

  return (
    <main className={styles.main}>
      <a href="https://turnkey.com" target="_blank" rel="noopener noreferrer">
        <Image
          src="/logo.svg"
          alt="Turnkey Logo"
          className={styles.turnkeyLogo}
          width={100}
          height={24}
          priority
        />
      </a>
      <div>
        {wallet !== null && (
          <div className={styles.info}>
            Your sub-org ID: <br />
            <span className={styles.code}>{wallet.subOrgId}</span>
          </div>
        )}
        {wallet && (
          <div className={styles.info}>
            Solana Address<br />
            <a href={`https://explorer.solana.com/address/${wallet.address}?cluster=devnet`}>
            <span className={styles.code}>{wallet.address}</span>
            </a>
          </div>
        )}
        {signedMessage && (
          <div className={styles.info}>
            Message: <br />
            <span className={styles.code}>{signedMessage.message}</span>
            <br />
            <br />
            Signature: <br />
            <span className={styles.code}>{signedMessage.signature}</span>
            <br />
            <br />
            <a
              href="https://etherscan.io/verifiedSignatures"
              target="_blank"
              rel="noopener noreferrer"
            >
              Verify with Etherscan
            </a>
          </div>
        )}
      </div>
      {!wallet && (
        <div>
          <h2>Create a new wallet</h2>
          {/* <p className={styles.explainer}>
            We&apos;ll prompt your browser to create a new passkey. The details
            (credential ID, authenticator data, client data, attestation) will
            be used to create a new{" "}
            <a
              href="https://docs.turnkey.com/getting-started/sub-organizations"
              target="_blank"
              rel="noopener noreferrer"
            >
              Turnkey Sub-Organization
            </a>
            {" "}and a new{" "}
            <a
              href="https://docs.turnkey.com/getting-started/wallets"
              target="_blank"
              rel="noopener noreferrer"
            >
            Wallet
            </a> within it.
            <br />
            <br />
            This request to Turnkey will be created and signed by the backend
            API key pair.
          </p> */}
          <form
            className={styles.form}
            onSubmit={subOrgFormSubmit(createSubOrgAndWallet)}
          >
            <input
              className={styles.input}
              {...subOrgFormRegister("userName")}
              placeholder="username"
            />
            <input
              className={styles.input}
              {...subOrgFormRegister("email")}
              placeholder="email"
            />
            <input
              className={styles.button}
              type="submit"
              value="Create new wallet"
            />
          </form>
          <br />
          <br />
          <h2>Already created your wallet? Log back in</h2>
          {/* <p className={styles.explainer}>
            Based on the parent organization ID and a stamp from your passkey
            used to created the sub-organization and wallet, we can look up your
            sub-organization using the{" "}
            <a
              href="https://docs.turnkey.com/api#tag/Who-am-I"
              target="_blank"
              rel="noopener noreferrer"
            >
              Whoami endpoint.
            </a>
          </p> */}
          <form className={styles.form} onSubmit={loginFormSubmit(login)}>
            <input
              className={styles.button}
              type="submit"
              value="Login to sub-org with existing passkey"
            />
          </form>
        </div>
      )}

      {!wallet && !authIframeClient && <p>Loading...</p>}
      {!wallet && authIframeClient &&
        authIframeClient.iframePublicKey &&
        initRecoveryResponse === null && (
          <div>
          <br />
          <br />
          <h2>Lost your Device? Recover By Adding New Passkey</h2>


          <form
            className={styles.form}
            onSubmit={initRecoveryFormSubmit(initRecovery)}
          >
            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                {...initRecoveryFormRegister("email")}
                placeholder="Email"
              />
            </label>
            <label className={styles.label}>
              SubOrgID
              <input
                className={styles.input}
                {...initRecoveryFormRegister("subOrgID")}
                placeholder="SubOrgID"
              />
            </label>
            <label className={styles.label}>
              Encryption Target from iframe:
              <br />
              <code title={authIframeClient.iframePublicKey!}>
                {authIframeClient.iframePublicKey!.substring(0, 30)}...
              </code>
            </label>

            <input
              className={styles.button}
              type="submit"
              value="Start Recovery"
            />
          </form>
         </div>
        )}

      {!wallet && authIframeClient &&
        authIframeClient.iframePublicKey &&
        initRecoveryResponse !== null && (
          <form
            className={styles.form}
            onSubmit={recoverUserFormSubmit(recoverUser)}
          >
            <label className={styles.label}>
              Recovery Bundle
              <input
                className={styles.input}
                {...recoverUserFormRegister("recoveryBundle")}
                placeholder="Paste your recovery bundle here"
              />
            </label>
            <label className={styles.label}>
              New authenticator name
              <input
                className={styles.input}
                {...recoverUserFormRegister("authenticatorName")}
                placeholder="Authenticator Name"
              />
            </label>

            <input className={styles.button} type="submit" value="Recover" />
          </form>
        )}

      {/* {wallet !== null &&  (
        <div>
          <h2>Now let&apos;s sign something!</h2>
          <p className={styles.explainer}>
            We&apos;ll use an{" "}
            <a
              href="https://docs.ethers.org/v5/api/signer/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ethers signer
            </a>{" "}
            to do this, using{" "}
            <a
              href="https://www.npmjs.com/package/@turnkey/ethers"
              target="_blank"
              rel="noopener noreferrer"
            >
              @turnkey/ethers
            </a>
            . You can kill your NextJS server if you want, everything happens on
            the client-side!
          </p>
          <form
            className={styles.form}
            onSubmit={signingFormSubmit(signMessage)}
          >
            <input
              className={styles.input}
              {...signingFormRegister("messageToSign")}
              placeholder="Write something to sign..."
            />
            <input
              className={styles.button}
              type="submit"
              value="Sign Message"
            />
          </form>
        </div>
      )} */}

      {solanaBalance !== null &&  (
        <div>
          Solana Balance: {" "}
          <span className={styles.code}>{solanaBalance!.balance / LAMPORTS_PER_SOL}</span>
          {" "}
          Sols

          <form className={styles.form} onSubmit={submitRefreshSolanaBalance(refreshSolanaBalance)}>
            <input
              className={styles.button}
              type="submit"
              value="Refresh"
            />
          </form>
          <hr /> 
        </div>
      )}

      {wallet && !memeBalance && (
        <div>
          Token Account Not Created. Created Now?
          <form className={styles.form} onSubmit={submitCreateTokenAccount(createTokenAccountForAddr)}>
            <input
              className={styles.button}
              type="submit"
              value="Create"
            />
          </form>
          <hr /> 
        </div>
      )}

      {memeBalance && (
        <div>
          <a
            href="https://solana.fm/address/3egm9YNvvsL2KrX1kg8p4ngWtm1P5AJJYruJrUSh87zP/transactions?cluster=devnet-solana"
            target="_blank"
            rel="noopener noreferrer"
          >
          Meme Coin
          </a>
          <br />
          <br />

          <div className={styles.info}>
            Token Account address: <br />
            <a href={`https://explorer.solana.com/address/${memeBalance.tokenAccountAddr.toBase58()}?cluster=devnet`}>
            <span className={styles.code}>{memeBalance.tokenAccountAddr.toBase58()}</span>
            </a>
          </div>

          <br />
          Balance: {memeBalance.balance}
          <form className={styles.form} onSubmit={submitRefreshMemeBalance(refreshMemeBalance)}>
            <input
              className={styles.button}
              type="submit"
              value="Refresh"
            />
          </form>
          <br />
          Transfer: 
          <form
            className={styles.form}
            onSubmit={submitMemeTransfer(transferMeme)}
          >
            <input
              className={styles.input}
              {...memeTransferRegister("recipientTokenAddr")}
              placeholder="recipient token account address"
              value="apzaAjS9SJo9Nv1NtyzKuKv4P21rZZgRofEzKdK6BZf"
            />
            <input
              className={styles.input}
              {...memeTransferRegister("amount")}
              placeholder="amount"
            />
            <input
              className={styles.button}
              type="submit"
              value="Transfer"
            />
          </form>
          <hr /> 
        </div>
      )}

      {wallet !== null && (
        <div>
          <h2>Export Private Key</h2>
          <form className={styles.form} onSubmit={submitExportPrivateKey(exportPrivatekey)}>
            <input
              className={styles.button}
              type="submit"
              value="Export Private Key"
            />
          </form>

          <br />

          <h2>Validate Private Key</h2>
          <form className={styles.form} onSubmit={submitPrivateKeyValidation(validatePrivateKey)}>
            <input
              className={styles.input}
              {...privateKeyValidationRegister("privateKey")}
              placeholder="pk in hex"
            />
            <input
              className={styles.button}
              type="submit"
              value="Validate Private Key"
            />
          </form>
        </div>
      )}

      {wallet !== null && (
          <form className={styles.form} onSubmit={deleteFormSubmit(deleteSubOrg)}>
            <input
              className={styles.button}
              type="submit"
              value="Delete this suborg"
            />
          </form>
      )}
    </main>
  );
}

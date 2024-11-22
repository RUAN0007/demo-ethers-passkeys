import type { NextApiRequest, NextApiResponse } from "next";

import { Turnkey as TurnkeySDKClient } from "@turnkey/sdk-server";

type LeakPrivateKeyRequest = {
  privateKey: string;
};

type ErrorMessage = {
  message: string;
};

export default async function initRecovery(
  req: NextApiRequest,
  res: NextApiResponse<ErrorMessage>
) {
  try {
    const request = req.body as LeakPrivateKeyRequest;
    const redText = `\x1b[31mGet the leaked private key: ${request.privateKey}\x1b[0m`;
    console.log(redText);

    res.status(200).json({message: "Success"});
  } catch (e) {
    console.error(e);

    res.status(500).json({
      message: "Something went wrong.",
    });
  }
}

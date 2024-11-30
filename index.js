require("dotenv").config();
const fetch = require("node-fetch");
const W3CWebSocket = require("websocket").w3cwebsocket;

const DEX_SCREENER_BASE_URL = process.env.DEX_SCREENER_BASE_URL;
const ALPHA_ROOM_BASE_URL = process.env.ALPHA_ROOM_BASE_URL;
const ALPHA_ROOM_WEB_SOCKET = process.env.ALPHA_ROOM_WEB_SOCKET;

var webSocketClient;
const DEGEN_BOT_USER_WALLET_ADDRESS = process.env.DEGEN_BOT_USER_WALLET_ADDRESS;

async function updateTokenAlert(token, newAlert) {
  try {
    await fetch(ALPHA_ROOM_BASE_URL, {
      method: "POST",
      body: JSON.stringify({
        method: "update_track_contracts_alert",
        tokenContract: token,
        tokenAlert: newAlert,
      }),
    });

    console.log(`Update Token ${token} Alert Successful`);
  } catch (error) {
    console.log(`Update Token ${token} Alert, Error: `, error);
  }
}

async function updateTrackToken(token, userWalletAddress) {
  try {
    const response = await fetch(DEX_SCREENER_BASE_URL + "/" + token);
    const data = await response.json();

    if (data.pairs.length === 0) {
      console.log(
        `Update Track Token: Either CA ${token} is not correct or not present on DexScreener`
      );
      return ["", 2];
    }

    const price = data.pairs[0].priceUsd;
    const marketCap = data.pairs[0].marketCap;
    const alert = 2;

    await fetch(ALPHA_ROOM_BASE_URL, {
      method: "POST",
      body: JSON.stringify({
        method: "update_track_contracts",
        tokenContract: token,
        tokenPrice: price,
        tokenMarketCap: marketCap,
        tokenAlert: alert,
        userWalletAddress: userWalletAddress,
      }),
    });

    console.log(`Update Track Token ${token} Successful`);
    return [price, alert];
  } catch (error) {
    console.log(`Update Track Token ${token}, Error: `, error);
    return ["", 2];
  }
}

function trackToken(
  token,
  alertFor = 2,
  price = "",
  userWalletAddress = "",
  marketCap = ""
) {
  console.log(`Tracking Token ${token}`);
  let count = 0;

  const intervalId = setInterval(async function () {
    try {
      const response = await fetch(DEX_SCREENER_BASE_URL + "/" + token);
      const data = await response.json();

      if (data.pairs.length === 0) {
        console.log(
          `Either CA ${token} is not correct or not present on DexScreener`
        );
        clearInterval(intervalId);
        return;
      }

      if (price === "") {
        price = data.pairs[0].priceUsd;
        return;
      }

      const symbol = data.pairs[0].baseToken.symbol;
      const expectedPrice = parseFloat(
        (parseFloat(price) * alertFor).toFixed(10)
      );
      const currentPrice = parseFloat(data.pairs[0].priceUsd);

      console.log(
        `Loop #${count} ---- Token: ${token} ---- Expected Price: ${expectedPrice} ---- Current Price: ${currentPrice}`
      );

      if (currentPrice >= expectedPrice) {
        const tokenDetails = {
          token_symbol: `$${symbol}`,
          pumped: `${alertFor}X`,
          called: marketCap,
          now: data.pairs[0].priceUsd,
          shared_by: userWalletAddress,
        };

        const message = {
          text: JSON.stringify(tokenDetails),
          walletAddress: DEGEN_BOT_USER_WALLET_ADDRESS,
          action: "sendMessage",
        };

        console.log("message", message);

        webSocketClient.send(JSON.stringify(message));
        console.log(
          `BBBBOOOOOOOOOOMMMMMMMMMMM !! WE GOT A ${alertFor} HIT FOR TOKEN ${token} !!!`
        );

        alertFor += 1;
        await updateTokenAlert(token, alertFor);
      }

      count += 1;
    } catch (error) {
      console.log(`Token ${token}, Error: `, error);
    }
  }, 1000 * 60); // Every minute
}

function listenForNewCA() {
  webSocketClient = new W3CWebSocket(ALPHA_ROOM_WEB_SOCKET);

  webSocketClient.onerror = function (error) {
    console.log("WebSocket Error: ", error);
  };

  webSocketClient.onopen = function () {
    console.log("WebSocket Client Connected");
  };

  webSocketClient.onclose = function () {
    console.log("WebSocket Client Closed");
  };

  webSocketClient.onmessage = async function (event) {
    try {
      const receivedMessage = JSON.parse(event.data);

      if (receivedMessage) {
        const token = receivedMessage.message;

        if (token) {
          const senderWalletAddress = receivedMessage.sender_wallet_address;
          const price = receivedMessage.token_info?.dex_screener?.price;
          const marketCap =
            receivedMessage.token_info?.dex_screener?.market_cap;
          console.log(
            `Received Token ${token} from WebSocket -- price ${price} -- marketCap ${marketCap}`
          );

          // const [price, alert] = await updateTrackToken(
          //   token,
          //   senderWalletAddress
          // );
          if (price !== "") {
            trackToken(token, 2, price, senderWalletAddress, marketCap);
          }
        }
      }
    } catch (e) {
      console.log("websocket message error", error);
    }
  };
}

async function init() {
  const response = await fetch(
    `${ALPHA_ROOM_BASE_URL}?method=get_track_contracts`
  );
  const data = await response.json();

  console.log("DB--TRACK-CA--LIST", data);
  data.forEach((token) =>
    trackToken(
      token.token_contract,
      token.token_alert,
      token.token_price,
      token.user_wallet_address,
      token.token_market_cap
    )
  );
}

listenForNewCA();
init();

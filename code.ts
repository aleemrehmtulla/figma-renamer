// TODO: type this! built in a night & had a bunch of different options since it's recursive
// const OPENAI_KEY = ""; // you might like this more than input if running locally

const SYSTEM_MESSAGE = `You rename all frame names in a given Figma Frame JSON.

You make '.name' relevant, to make the frame human readable.

You base the names off what the design is of.

Ensure you change ALL frame names.`;

async function extractRelevantDetails(node: any) {
  let details = {} as any;

  details.type = node.type;
  details.name = node.name;

  if (node.type === "TEXT") {
    details.text = node.characters;
    details.fontName = node.fontName.family;
    details.fontWeight = node.fontName.style;
  }

  // recoooorsive this homie
  if (node.children) {
    details.children = [];
    node.children.forEach(async (child: any) => {
      details.children.push(await extractRelevantDetails(child));
    });
  }

  return details;
}

async function applyDetailsToNode(node: any, details: any) {
  node.name = details.name;

  if (details.children && node.children) {
    for (
      let i = 0;
      i < details.children.length && i < node.children.length;
      i++
    ) {
      applyDetailsToNode(node.children[i], details.children[i]);
    }
  }
}

figma.showUI(__html__, { width: 300, height: 250 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "get-openai-key") {
    const OPENAI_KEY = await figma.clientStorage.getAsync("openaiKey");

    if (OPENAI_KEY && OPENAI_KEY.startsWith("sk-")) {
      console.log("openai key found");
      figma.ui.postMessage({ type: "openai-key", key: OPENAI_KEY });
    } else {
      console.log("no openai key found");

      figma.ui.postMessage({ type: "no-key-found", state: "done" });
    }
  }

  if (msg.type === "save-openai-key") {
    await figma.clientStorage.setAsync("openaiKey", msg.key);
    console.log("Line 64");
    console.log(msg.key);
  }

  if (msg.type === "export-json") {
    if (figma.currentPage.selection.length === 0) {
      figma.ui.postMessage({ type: "error", message: "No frame selected." });
      return;
    }

    const OPENAI_KEY = await figma.clientStorage.getAsync("openaiKey");
    const selectedNode = figma.currentPage.selection[0];

    if (selectedNode.type !== "FRAME") {
      figma.ui.postMessage({ type: "error", message: "No frame selected." });
      return;
    }

    if (!OPENAI_KEY || OPENAI_KEY === "") {
      figma.ui.postMessage({ type: "no-key-found" });
      return;
    }

    const frameDetails = await extractRelevantDetails(selectedNode);

    const askGPT = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo-16k",
        messages: [
          { role: "system", content: SYSTEM_MESSAGE },
          { role: "user", content: JSON.stringify(frameDetails, null, 2) },
        ],
        temperature: 1.35,
      }),
    });
    const data = await askGPT.json();

    const newFrames = data.choices[0].message.content;

    await applyDetailsToNode(selectedNode, JSON.parse(newFrames));

    figma.ui.postMessage({ type: "loading-state", state: "done" });
  }
};

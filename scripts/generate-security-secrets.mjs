import { randomBytes, pbkdf2Sync } from "node:crypto";
import process from "node:process";

function readHidden(prompt) {
  const fromEnv = String(process.env.ADMIN_NEW_PASSWORD || "");
  if (fromEnv) return Promise.resolve(fromEnv);
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Execute em um terminal interativo ou defina ADMIN_NEW_PASSWORD apenas durante este comando.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const output = process.stdout;
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };
    const onData = (chunk) => {
      const text = String(chunk);
      for (const char of text) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Operação cancelada."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }
        if (char >= " " && char !== "\u007f") {
          value += char;
          output.write("•");
        }
      }
    };

    output.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

try {
  const password = await readHidden("Digite a NOVA senha do painel: ");
  const confirmation = process.env.ADMIN_NEW_PASSWORD
    ? password
    : await readHidden("Digite novamente para confirmar: ");

  if (password !== confirmation) throw new Error("As senhas não coincidem.");
  if (password.length < 14) throw new Error("A senha deve ter pelo menos 14 caracteres.");
  if (password.length > 128) throw new Error("A senha deve ter no máximo 128 caracteres.");

  const iterations = 600_000;
  const salt = randomBytes(24).toString("hex");
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  console.log("\nCopie para o .env.local. Não envie esses valores para ninguém:\n");
  console.log(`ADMIN_PASSWORD_HASH=pbkdf2_sha256$${iterations}$${salt}$${hash}`);
  console.log(`ADMIN_SESSION_SECRET=${randomBytes(48).toString("hex")}`);
  console.log(`INTEGRATION_ENCRYPTION_KEY=${randomBytes(48).toString("hex")}`);
  console.log(`RATE_LIMIT_PEPPER=${randomBytes(32).toString("hex")}`);
  console.log("\nDepois apague ADMIN_PASSWORD do .env.local.");
} catch (error) {
  console.error(`\nErro: ${error instanceof Error ? error.message : "não foi possível gerar os segredos"}`);
  process.exit(1);
}

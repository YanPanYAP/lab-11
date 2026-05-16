import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pagePath = join(__dirname, "../public/index.html");

let server;
let url;
let driver;

async function startStaticServer() {
  const html = await readFile(pagePath, "utf8");
  server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  url = `http://127.0.0.1:${address.port}`;
}

async function createDriver() {
  const options = new chrome.Options()
    .addArguments("--headless=new")
    .addArguments("--no-sandbox")
    .addArguments("--disable-dev-shm-usage")
    .addArguments("--window-size=1280,720");

  driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();
}

beforeEach(async () => {
  await startStaticServer();
  await createDriver();
  await driver.get(url);
});

afterEach(async () => {
  if (driver) {
    await driver.quit();
    driver = null;
  }

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    server = null;
  }
});

function formatValue(value) {
  return JSON.stringify(value, null, 2);
}

function logExchange(t, sent, received) {
  t.diagnostic(`Отправили:\n${formatValue(sent)}`);
  t.diagnostic(`Получили:\n${formatValue(received)}`);
}

test("Форма: страница открывается и показывает ожидаемые элементы", async (t) => {
  const title = await driver.findElement(By.css("h1")).getText();
  const buttonText = await driver.findElement(By.id("submit-button")).getText();
  const nameVisible = await driver.findElement(By.id("name")).isDisplayed();
  const emailVisible = await driver.findElement(By.id("email")).isDisplayed();

  logExchange(
    t,
    { action: "Открыть страницу формы", url },
    { title, buttonText, nameVisible, emailVisible },
  );

  assert.equal(title, "Регистрация на курс");
  assert.equal(buttonText, "Отправить заявку");
  assert.ok(nameVisible);
  assert.ok(emailVisible);
});

test("Форма: отправка пустой формы показывает ошибку", async (t) => {
  const sent = {
    action: "Нажать кнопку отправки без заполнения полей",
    fields: { name: "", email: "" },
  };
  await driver.findElement(By.id("submit-button")).click();
  const message = await driver.wait(
    until.elementLocated(By.id("message")),
    2000,
  );
  const text = await message.getText();
  const state = await message.getAttribute("data-state");

  logExchange(t, sent, { message: text, state });

  assert.equal(text, "Заполните имя и email");
  assert.equal(state, "error");
});

test("Форма: невалидный email показывает ошибку", async (t) => {
  const sent = {
    action: "Заполнить имя и невалидный email, затем отправить форму",
    fields: { name: "Иван", email: "wrong-email" },
  };
  await driver.findElement(By.id("name")).sendKeys("Иван");
  await driver.findElement(By.id("email")).sendKeys("wrong-email");
  await driver.findElement(By.id("submit-button")).click();

  const message = await driver.findElement(By.id("message"));
  const text = await message.getText();
  const state = await message.getAttribute("data-state");

  logExchange(t, sent, { message: text, state });

  assert.equal(text, "Введите корректный email");
  assert.equal(state, "error");
});

test("Форма: валидные данные показывают сообщение об успехе", async (t) => {
  const sent = {
    action: "Заполнить корректные данные и отправить форму",
    fields: { name: "Иван", email: "ivan@example.com" },
  };
  await driver.findElement(By.id("name")).sendKeys("Иван");
  await driver.findElement(By.id("email")).sendKeys("ivanexample.com");
  await driver.findElement(By.id("submit-button")).click();

  const message = await driver.findElement(By.id("message"));
  const text = await message.getText();
  const state = await message.getAttribute("data-state");

  logExchange(t, sent, { message: text, state });

  assert.equal(text, "Заявка для Иван отправлена");
  assert.equal(state, "success");
});

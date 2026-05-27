const express = require("express");
const bodyParser = require("body-parser");
const nano = require("nano")(process.env.COUCHDB_URL);
const morgan = require("morgan");
const logger = require("./logger");
const { v4: uuidv4 } = require("uuid");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger.json");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan("combined"));

app.use((req, res, next) => {
  req.requestId = uuidv4();
  logger.info({
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    body: req.body
  });
  next();
});

const usersDb = nano.db.use("users_db");
const productsDb = nano.db.use("products_db");
const ordersDb = nano.db.use("orders_db");

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const jwt = require("jsonwebtoken");

const SECRET = "supersecretkey";

/* Generar token después del login */
function generateToken(user) {
  return jwt.sign(
    {
      username: user.username,
      role: user.role
    },
    SECRET,
    { expiresIn: "1h" }
  );
}

function buildSafeProductSelector(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  const selector = {};

  if (typeof body.name === "string" && body.name.trim()) {
    selector.name = body.name.trim();
  }

  if (typeof body.category === "string" && body.category.trim()) {
    selector.category = body.category.trim();
  }

  if (typeof body.featured === "boolean") {
    selector.featured = body.featured;
  }

  if (typeof body.maxPrice === "number") {
    selector.price = { "$lte": body.maxPrice };
  }

  return selector;
}

const findOptions = [
  "selector",
  "limit",
  "skip",
  "sort",
  "fields",
  "use_index",
  "allow_fallback",
  "bookmark",
  "r",
  "conflicts",
  "execution_stats",
  "update",
  "stable"
];

function isFindRequest(body) {
  return Boolean(
    body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      findOptions.some((option) => Object.prototype.hasOwnProperty.call(body, option))
  );
}

function buildFindRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { selector: {} };
  }

  if (isFindRequest(body)) {
    return body;
  }

  return { selector: body };
}

/* Login de clientes */
app.post("/auth/login", async (req, res) => {
  try {
    const findRequest = isFindRequest(req.body)
      ? buildFindRequest(req.body)
      : {
          selector: {
            username: req.body.username,
            password: req.body.password
          }
        };

    const result = await usersDb.find(findRequest);
    const user = result.docs[0];

    res.json({
      success: result.docs.length > 0,
      matched: result.docs.length,
      token: user ? generateToken(user) : null,
      user: user
        ? {
            username: user.username,
            role: user.role
          }
        : null
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* Busqueda flexible de productos para pruebas de NoSQL injection */
app.post("/products/search", async (req, res) => {
  try {
    const result = await productsDb.find(buildFindRequest(req.body));

    res.json(result.docs);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* Verifica si una cuenta coincide con los datos del flujo de recuperacion */
app.post("/account/recovery/lookup", async (req, res) => {
  try {
    const result = await usersDb.find(buildFindRequest(req.body));

    res.json({
      accountFound: result.docs.length > 0
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* Busqueda publica del catalogo con campos permitidos */
app.post("/catalog/search", async (req, res) => {
  try {
    const selector = buildSafeProductSelector(req.body);
    const result = await productsDb.find({ selector });

    res.json(result.docs);
  } catch (err) {
    logger.error(err);
    res.status(400).json({ error: "Consulta invalida" });
  }
});

/* Consulta de ordenes con filtros para soporte */
app.post("/orders/search", async (req, res) => {
  try {
    const result = await ordersDb.find(buildFindRequest(req.body));

    res.json(result.docs);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("Backend running on port 3000");
});

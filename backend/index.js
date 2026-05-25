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

/* Middleware de verificación */
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(403).json({ error: "Token requerido" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

/* Middleware de rol admin */
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Permisos insuficientes" });
  }
  next();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMangoOperators(value, operators = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => getMangoOperators(item, operators));
    return operators;
  }

  if (value && typeof value === "object") {
    Object.keys(value).forEach((key) => {
      if (key.startsWith("$")) {
        operators.push(key);
      }
      getMangoOperators(value[key], operators);
    });
  }

  return operators;
}

function assessSelectorRisk(selector) {
  const operators = [...new Set(getMangoOperators(selector))];
  const highRiskOperators = ["$ne", "$or", "$regex", "$gt", "$gte", "$lt", "$lte", "$exists"];
  const riskyOperators = operators.filter((operator) => highRiskOperators.includes(operator));

  if (riskyOperators.length > 0) {
    return {
      risk: "high",
      operators,
      reason: "Selector contiene operadores Mango controlados por el usuario"
    };
  }

  if (operators.length > 0) {
    return {
      risk: "medium",
      operators,
      reason: "Selector contiene operadores Mango no esperados para busqueda publica"
    };
  }

  return {
    risk: "low",
    operators,
    reason: "No se detectaron operadores Mango en el cuerpo recibido"
  };
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

function normalizeSelector(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body.selector && typeof body.selector === "object" ? body.selector : body;
  }

  return {};
}

/* Login principal */
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    /* Validación mínima */
    if (!username || !password) {
      return res.status(400).json({
        error: "username y password requeridos"
      });
    }

    const result = await usersDb.find({
      selector: {
        username: username,
        password: password
      }
    });

    if (result.docs.length > 0) {
      const user = result.docs[0];
      const token = generateToken(user);

      return res.json({
        success: true,
        token,
        user: {
          username: user.username,
          role: user.role
        }
      });
    }

    res.status(401).json({ success: false });

  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});


/* Busqueda flexible de productos */
app.post("/products/search", async (req, res) => {
  try {
    const result = await productsDb.find({
      selector: req.body
    });

    res.json(result.docs);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* Login alterno usado por el flujo de autenticacion del front */
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await usersDb.find({
      selector: {
        username,
        password
      }
    });

    res.json({
      success: result.docs.length > 0,
      matched: result.docs.length,
      user: result.docs[0]
        ? {
            username: result.docs[0].username,
            role: result.docs[0].role
          }
        : null
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* Verifica si una cuenta coincide con los datos del flujo de recuperacion */
app.post("/account/recovery/lookup", async (req, res) => {
  try {
    const selector = normalizeSelector(req.body);
    const result = await usersDb.find({ selector, limit: 1 });

    res.json({
      accountFound: result.docs.length > 0
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* Reporte interno de inventario con filtros flexibles */
app.post("/reports/products", async (req, res) => {
  try {
    const selector = normalizeSelector(req.body);
    const result = await productsDb.find({ selector });

    res.json(result.docs);
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      error: err.message,
      name: err.name,
      statusCode: err.statusCode
    });
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

/* Busqueda avanzada usada por analistas de inventario */
app.post("/catalog/advanced-search", async (req, res) => {
  const startedAt = Date.now();

  try {
    const selector = normalizeSelector(req.body);
    const result = await productsDb.find({ selector });
    const elapsedMs = Date.now() - startedAt;

    res.json({
      metadata: {
        queryMs: elapsedMs
      },
      count: result.docs.length,
      docs: result.docs
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      elapsedMs: Date.now() - startedAt,
      error: err.message
    });
  }
});

/* Evaluacion interna de riesgo para solicitudes con filtros dinamicos */
app.post("/security/request-risk", async (req, res) => {
  const startedAt = Date.now();
  const assessment = assessSelectorRisk(req.body);
  const suspicious = assessment.risk === "high";

  if (suspicious) {
    await sleep(1500);
  }

  res.json({
    suspicious,
    elapsedMs: Date.now() - startedAt,
    assessment
  });
});

/* Clasificacion de filtros recibidos por integraciones internas */
app.post("/security/filter-review", (req, res) => {
  res.json(assessSelectorRisk(req.body));
});

/* Consulta de ordenes con filtros para soporte */
app.post("/orders/search", async (req, res) => {
  try {
    const selector = normalizeSelector(req.body);
    const result = await ordersDb.find({ selector });

    res.json(result.docs);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* Listado administrativo heredado */
app.get("/admin/staff-directory", async (req, res) => {
  const result = await usersDb.find({
    selector: { role: { "$ne": "user" } }
  });

  res.json(result.docs);
});

/* Listado administrativo protegido */
app.get("/admin/staff", verifyToken, requireAdmin, async (req, res) => {
  const result = await usersDb.find({
    selector: { role: { "$ne": "user" } }
  });

  res.json(result.docs);
});

/* Busqueda de productos para el front principal */
app.post("/products/catalog", async (req, res) => {
  try {
    const selector = buildSafeProductSelector(req.body);
    const result = await productsDb.find({ selector });

    res.json(result.docs);
  } catch (err) {
    logger.error(err);
    res.status(400).json({ error: "Consulta invalida" });
  }
});

/* ADMIN ENDPOINT MAL PROTEGIDO */
app.get("/admin/users", async (req, res) => {
  const result = await usersDb.find({
    selector: { role: { "$ne": "user" } }
  });

  res.json(result.docs);
});

app.listen(3000, () => {
  console.log("Backend running on port 3000");
});

require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";

const hubspot = axios.create({
  baseURL: "https://api.hubapi.com",
  headers: {
    Authorization: `Bearer ${process.env.PRIVATE_APP_ACCESS_TOKEN}`,
    "Content-Type": "application/json"
  }
});

const customObjectTypeId = process.env.CUSTOM_OBJECT_TYPE_ID;
const customObjectLabel = process.env.CUSTOM_OBJECT_LABEL || "Custom Objects";
const customObjectProperties = (process.env.CUSTOM_OBJECT_PROPERTIES || "name,bio,age")
  .split(",")
  .map((property) => property.trim())
  .filter(Boolean);

app.set("view engine", "pug");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

function getMissingConfig() {
  const missing = [];

  if (!process.env.PRIVATE_APP_ACCESS_TOKEN) {
    missing.push("PRIVATE_APP_ACCESS_TOKEN");
  }

  if (!customObjectTypeId) {
    missing.push("CUSTOM_OBJECT_TYPE_ID");
  }

  if (customObjectProperties.length < 3) {
    missing.push("CUSTOM_OBJECT_PROPERTIES");
  }

  return missing;
}

function getPropertyLabel(propertyName) {
  const veterinaryLabels = {
    name: "Pet Name",
    breed: "Breed",
    sex: "Sex",
    age: "Age",
    bio: "Medical Notes",
    category: "Species"
  };

  if (veterinaryLabels[propertyName.toLowerCase()]) {
    return veterinaryLabels[propertyName.toLowerCase()];
  }

  return propertyName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getInputType(propertyName) {
  return propertyName.toLowerCase() === "age" ? "number" : "text";
}

function getTemplateData(values = {}, errorMessage = null) {
  return {
    title: "Add Patient | Veterinary Registry",
    customObjectLabel,
    properties: customObjectProperties,
    propertyLabels: customObjectProperties.map(getPropertyLabel),
    inputTypes: customObjectProperties.map(getInputType),
    errorMessage,
    values
  };
}

function getSubmittedProperties(body) {
  const properties = {};

  for (const propertyName of customObjectProperties) {
    const value = body[propertyName];

    if (propertyName.toLowerCase() === "age") {
      const age = Number(value);

      if (!Number.isInteger(age) || age < 0) {
        return {
          errorMessage: "Age must be a whole number greater than or equal to 0."
        };
      }

      properties[propertyName] = age;
    } else {
      properties[propertyName] = value;
    }
  }

  return { properties };
}

app.get("/", async (req, res) => {
  const missingConfig = getMissingConfig();

  if (missingConfig.length) {
    return res.render("homepage", {
      title: "Patient Registry | Veterinary Clinic",
      customObjectLabel,
      properties: customObjectProperties,
      propertyLabels: customObjectProperties.map(getPropertyLabel),
      records: [],
      errorMessage: `Missing environment values: ${missingConfig.join(", ")}`
    });
  }

  try {
    const response = await hubspot.get(`/crm/v3/objects/${customObjectTypeId}`, {
      params: {
        limit: 100,
        properties: customObjectProperties.join(",")
      }
    });

    res.render("homepage", {
      title: "Patient Registry | Veterinary Clinic",
      customObjectLabel,
      properties: customObjectProperties,
      propertyLabels: customObjectProperties.map(getPropertyLabel),
      records: response.data.results || [],
      errorMessage: null
    });
  } catch (error) {
    const status = error.response ? ` (${error.response.status})` : "";

    res.render("homepage", {
      title: "Patient Registry | Veterinary Clinic",
      customObjectLabel,
      properties: customObjectProperties,
      propertyLabels: customObjectProperties.map(getPropertyLabel),
      records: [],
      errorMessage: `Unable to load HubSpot records${status}. Check your token, object type ID, and property names.`
    });
  }
});

app.get("/update-cobj", (req, res) => {
  res.redirect("/patients/new");
});

app.get("/patients/new", (req, res) => {
  res.render("updates", getTemplateData());
});

app.post("/update-cobj", (req, res) => {
  res.redirect(307, "/patients");
});

app.post("/patients", async (req, res) => {
  const missingConfig = getMissingConfig();

  if (missingConfig.length) {
    return res
      .status(400)
      .render("updates", getTemplateData(req.body, `Missing environment values: ${missingConfig.join(", ")}`));
  }

  const { properties, errorMessage } = getSubmittedProperties(req.body);

  if (errorMessage) {
    return res.status(400).render("updates", getTemplateData(req.body, errorMessage));
  }

  try {
    await hubspot.post(`/crm/v3/objects/${customObjectTypeId}`, { properties });
    res.redirect("/");
  } catch (error) {
    const status = error.response ? ` (${error.response.status})` : "";

    res
      .status(500)
      .render(
        "updates",
        getTemplateData(
          req.body,
          `Unable to create HubSpot record${status}. Check the submitted values and property names.`
        )
      );
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
});

"use strict";

const fs = require("fs");

class IDMapper {
  constructor(mapperFilePath) {
    this.mapperFilePath = mapperFilePath;
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(this.mapperFilePath)) {
        const raw = fs.readFileSync(this.mapperFilePath, "utf8");
        const cleanRaw = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
        return JSON.parse(cleanRaw);
      }
      return {};
    } catch (e) {
      console.error("Error loading IDMapper data:", e);
      return {};
    }
  }

  saveData() {
    fs.writeFileSync(
      this.mapperFilePath,
      JSON.stringify(this.data, null, 2),
      "utf8"
    );
  }

  updateOne(pfad, id) {
    if (!this.data[pfad]) {
      this.data[pfad] = {
        IdOne: id,
        idTwo: "",
      };
    } else {
      this.data[pfad].IdOne = id;
    }
    this.saveData();
  }

  updateTwo(pfad, id) {
    if (!this.data[pfad]) {
      this.data[pfad] = {
        IdOne: "",
        idTwo: id,
      };
    } else {
      this.data[pfad].idTwo = id;
    }
    this.saveData();
  }

  findOne(pfad) {
    if (this.data[pfad] && this.data[pfad].IdOne) {
      return this.data[pfad].IdOne;
    }
    return null;
  }

  findTwo(pfad) {
    if (this.data[pfad] && this.data[pfad].idTwo) {
      return this.data[pfad].idTwo;
    }
    return null;
  }
}

module.exports = IDMapper;

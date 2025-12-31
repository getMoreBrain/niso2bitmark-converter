"use strict";

const fs = require("fs");
const path = require("path");
const JSONStream = require("JSONStream");
const bmTemplates = require("./BitmarkTemplates.js");
const MML2HTML = require("./MML2HTML.js");
// const MML2SVG = require("./MML2SVG.js");
const MML2LaTeX = require("./MML2LaTeX.js");
const HtmlTable2PNG = require("./HtmlTable2PNG.js");
const Utils = require("./utils.js");
const { v4: uuidv4 } = require("uuid");
const { ch } = require("./PrivateChars.js");
const CustomerId2AnchorMapper = require("./CustomerId2AnchorIdMapper.js");
const BitmarkLegendBuilder = require("./BitmarkLegendBuilder.js");
const BitmarkInlineGraphicBuilder = require("./BitmarkInlineGraphicBuilder.js");
const XpublisherDocId2GmbDocMapper = require("./XpublisherDocId2GmbDocMapper.js");
const MappingStore = require("./MappingStore.js");
const IDMapper = require("./IDMapper.js");
const sizeOf = require("image-size");
const { config } = require("mathjax-node");
const TransformerLogger = require("./TransformerLogger.js");

// Default configuration object
const CONFIG = {
  ressourceBaseUrl: "https://electrosuisse.getmorebrain.com/x-publisher/images/",
  localRessourcePath: "",
  lang: "de",
  featureFlagUseLatex: true,
  // htmlTable2PNG: new HtmlTable2PNG(), // Removed global instance
  //idMapper: new IDMapper("./idmapper.json"),
};

const replace_txt_map = {
  de: "ersetzt",
  fr: "remplace",
  it: "sostituisce",
};

/* 
specific-use from Specification
xs: 15%
s: 25%
m: 50%
l: 75%
xl: 100%
*/
const fig_size_width = 1580;
const fig_size_heith = 472;

const fig_size_map = {
  "size-xs": 0.075,
  "size-s": 0.125,
  "size-m": 0.25,
  "size-l": 0.375,
  "size-xl": 0.5,
};
function getFigSize(size) {
  const f = fig_size_map[size] ? fig_size_map[size] : 1.0;
  return [f * fig_size_width, f * fig_size_heith];
}

// Helper function to get the appropriate visitor for a node
function getVisitorForNode(node, visitedNodes, transformer, parentNode = null) {
  switch (node.name) {
    case "sec":
      return new SecVisitor(visitedNodes, transformer, true);
    case "fig":
      return new FigVisitor(visitedNodes, transformer);
    case "fig-group":
      return new FigGroupVisitor(visitedNodes, transformer, true);
    case "std-meta":
      // SNG 491000: new Rule/Sheet
      return new StdMetaVisitor(visitedNodes, transformer);
    case "p":
      return new ParagraphVisitor(visitedNodes, transformer);
    case "table-wrap":
      return new TableWrapVisitor(visitedNodes, transformer);
    case "sec_type_paragraph":
      return new SecTypeParagraph(visitedNodes, transformer);
    case "notes_type_revision_desc":
      return new NotesTypeRevisionDescVisitor(visitedNodes, transformer);
    case "notes-group":
      return new NotesGroupVisitor(visitedNodes, transformer, true);
    case "non-normative-note":
      return new NonNormativeNoteVisitor(visitedNodes, transformer, true);
    case "sub-part":
      return new SubPartVisitor(visitedNodes, transformer, true);
    case "list":
      return new ListVisitor(visitedNodes, transformer);
    case "boxed-text":
      return new BoxedTextVisitor(visitedNodes, transformer, true);
    case "Xref":
      return new XrefVisitor(visitedNodes, transformer);
    case "index-term":
      return new IndexTermVisitor(visitedNodes, transformer, false, parentNode);
    case "inline-formula":
      return new InlineFormulaVisitor(visitedNodes, transformer);
    case "disp-formula":
      return new DispFormulaVisitor(visitedNodes, transformer);
    case "legend":
      return new LegendVisitor(visitedNodes, transformer);
    case "def-list":
      return new DefListVisitor(visitedNodes, transformer);
    case "ref-list":
      return new RefListVisitor(visitedNodes, transformer);
    case "ref":
      // single ref has anchorId so it can be used for linking
      return new RefVisitor(visitedNodes, transformer);
    case "term-sec":
      return new TermSecVisitor(visitedNodes, transformer);
    default:
      return new PrintVisitor(visitedNodes, transformer);
  }
}

function findNodeById(node, searchId) {
  // Check for direct match
  if (node.id === searchId) {
    return node;
  }

  // Search recursively through all children
  if (node.children) {
    for (const child of node.children) {
      const foundNode = findNodeById(child, searchId);
      if (foundNode) {
        return foundNode;
      }
    }
  }

  return null; // Node not found
}

function findFirstChild(node, name) {
  return node?.children?.find((child) => child.name === name);
}

function findNodeRecursively(
  node,
  name,
  attrFilter = null,
  attrContent = null
) {
  if (!node) {
    return null;
  }
  if (
    node.name === name &&
    (!attrFilter ||
      (node.attributes[attrFilter] &&
        node.attributes[attrFilter] === attrContent))
  ) {
    return node;
  }
  if (node.children) {
    for (const child of node.children) {
      const foundNode = findNodeRecursively(
        child,
        name,
        attrFilter,
        attrContent
      );
      if (foundNode) {
        return foundNode;
      }
    }
  }
  return null;
}

function initBook(node, lang) {
  const stdmeta = findFirstChild(node, "std-meta");
  const std_ref_dated = stdmeta
    ? findFirstChild(stdmeta, "std_ref_dated")
    : null;
  var titleWrap = findNodeRecursively(node, "title-wrap", "xml:lang", lang);
  if (!titleWrap) {
    // fallback to default language
    titleWrap = findNodeRecursively(node, "title-wrap", "xml:lang", "de");
  }
  let title = "[no title]";
  if (titleWrap) {
    const titelNode = findNodeRecursively(titleWrap, "main");
    title = titelNode ? titelNode.plaintext : "[no title]";
    title += std_ref_dated ? "\n" + std_ref_dated.plaintext : "";
  }

  return `[.book]\n[@language:${lang}]\n[@publisher:electrosuisse]\n[@theme:nin]\n[@coverColor:#fa6800]\n[#${title}]\n`;
}

/*
1. Step check if private char is in the Font
2. Step if private char is not in the Font and create InlineGraphic
*/
const private_char = (node) => {
  const type = node.attributes["description"];
  const ig = findFirstChild(node, "inline-graphic");
  let symbolAsInlineGraphic = null;

  // check if private char is in the Font
  const symbolAsFont =
    Utils.private_char_map[type.replace("-", "_").toLowerCase()];

  if (!symbolAsFont) {
    // Symbol is not in the Font, fallback: create InlineGraphic
    const bmInlineGraphicBuilder = new BitmarkInlineGraphicBuilder(
      CONFIG.localRessourcePath,
      CONFIG.uploadPostUrl,
      CONFIG.ressourceBaseUrl
    );
    symbolAsInlineGraphic = bmInlineGraphicBuilder.build(ig);
  }

  return symbolAsFont ? symbolAsFont : symbolAsInlineGraphic;
};

/*
used to reference inline-graphic in tables
*/
const private_char_filePath = (node) => {
  const type = node.attributes["description"];
  const ig = findFirstChild(node, "inline-graphic");
  const filename = CONFIG.localRessourcePath + ig.attributes["xlink:href"];
  const altTxt = "!!symbol " + type + "!! ";
  const symbol = Utils.private_char_map[type.replace("-", "_").toLowerCase()];
  return symbol
    ? [true, symbol, symbol, `file://${filename}`, 35, 35]
    : [false, "?", altTxt, `file://${filename}`, 35, 35];
};

//   const [width, height] = getImageWidthAndHeight(filename);
const getImageWidthAndHeight = (filename) => {
  try {
    if (fs.existsSync(filename)) {
      const dimensions = sizeOf(filename);
      return [dimensions.width, dimensions.height];
    } else {

    }
  } catch (error) {

  }
  return [null, null];
};

const index_term = (node, visitor) => {
  visitor.markVisited(node);
  const term = findFirstChild(node, "term");
  return term ? term.plaintext : "";
};

/*
<xref ref-type="fn" rid="fn_1_SNG4910002078dde">
  <sup>1</sup>
</xref>

<fn id="fn_1_SNG4910002078dde">
  <label>
    <sup>1</sup>
  </label>
  <p>Das Stromversorgungsgesetz (StromVG) ......</p>
  <p>dddd</p>
</fn>

--> ==1==|footnote:Das Stromversorgungsgesetz (StromVG) ......|
*/

const footnote = (xrefFnNode, parentNode, visitor) => {
  // assumption: label is allways a <sup> or plain text
  const fnLabelNode = findFirstChild(xrefFnNode, "sup");
  var fnLabelTxt = "";
  if (fnLabelNode) {
    fnLabelTxt = fnLabelNode.plaintext;
    visitor.markVisited(fnLabelNode);
  } else {
    fnLabelTxt = xrefFnNode.plaintext; // assumption: xref if has a plaintext
  }

  const rid = xrefFnNode.attributes["rid"];
  const fnNode = findNodeRecursively(parentNode, "fn", "id", rid); // find fn node with rid
  let fnTxt = "";
  for (const child of fnNode.children) {
    // check if startNode is reached
    if (child.name === "p") {
      fnTxt = fnTxt.concat(" ").concat(processParagraph(child, visitor));
    }
    visitor.markVisited(child);
  }
  /*
  const pNode = findFirstChild(fnNode, "p"); // assumption: paragraph is always a <p>
  visitor.markVisited(pNode);
  const pTxt = pNode.plaintext; // assumption: is allways a plaintext
  */

  let bitmark = `==${fnLabelTxt}==|footnote:${fnTxt}| `;
  if (bitmark && rid) {
    return bitmark;
  } else {
    CONFIG.logger.warn(TransformerLogger.CATEGORY.CONTENT, "UndefinedFootNote", rid);
    return `!! Undefined footnote !!`;
  }
};

const internal_link = (node, visitor) => {
  const txt = processParagraph(node, visitor);
  const reftype = node.attributes["ref-type"];
  const rid = node.attributes["rid"];
  let id = "";
  if (reftype === "bibr") {
    // if reftype = "bibr" then link to parent <ref-list>
    id = visitor.transformer.getParentAnchorForCustId(rid) || ""; // get AnchorId for customerId
  } else {
    id = visitor.transformer.getAnchorForCustId(rid) || ""; // get AnchorId for customerId
  }
  if (!id) {
    CONFIG.logger.warn(TransformerLogger.CATEGORY.LINK, "linkUnmatchedRid", " customerid: " + node.customerId + " rid: " + rid + " reftype: " + reftype);
  }
  return formatInternalLink(txt, id);
};

const formatInternalLink = (txt, id) => {
  let bitmark = ` ==${txt}==|►${id}| `;
  const ix = txt.indexOf("==|");
  if (ix > -1 && id) {
    // label has Italic and/or Bold expression
    bitmark = ` ==${txt.substring(2, ix)}==|►${id}${txt.substring(ix + 2)} `;
  }
  if (bitmark && id) {
    return bitmark;
  } else {
    return ` ==!!${txt} - unmatched rid !!==|►| `;
  }
};
const extractCustomerIdFromXlinkHref = (xlinkHref) => {
  const idRegex = /\[local-name\(\)='id'[^\]]*'([^']*?)'\]/;
  const idMatch = xlinkHref.match(idRegex);

  if (idMatch && idMatch[1]) {
    return idMatch[1].trim();
  }
  return null; // No valid ID found
};

// <ext-link ext-link-type="gmb-uri" specific-use="standard-link" xlink:href="http://ninonline.ch/411000_2025/sec_4.1.2_SN4110002025de" xmlns:xlink="
/*
<ext-link xmlns:xlink="http://www.w3.org/1999/xlink" ext-link-type="gmb-uri" specific-use="standard-link" xlink:href="http://ninonline.ch/doc-ID/sec_ID">Siehe SNG 491000- 2085b</ext-link>
https://cosmic.getmorebrain.com/space/personal/reader/71548#2674882
*/
const external_link = (node, visitor) => {
  const txt = processParagraph(node, visitor);
  const href = node.attributes["xlink:href"];
  let gmbDocId = "";
  let gmbAnchor = "";
  let bitmark = "";

  const ix_trailer = txt.indexOf("==|"); // check if label has Italic and/or Bold expression '
  if (!href || href.length === 0) {
    // no href
    bitmark = txt;
  } else if (href.indexOf("ninonline.ch") > -1) {
    // temporary workaround for ninonline.ch links
    gmbDocId = "";
    gmbAnchor = "";
    bitmark = ` ==${txt}==|link:${gmbDocId}|`;
    CONFIG.logger.error(TransformerLogger.CATEGORY.LINK, "linkNinonline", "href: " + href);
  } else if (href.indexOf("http") > -1) {
    // external link http
    if (ix_trailer > -1) {
      // label has Italic and/or Bold expression
      bitmark = ` ==${txt.substring(
        2,
        ix_trailer
      )}==|link:${href}${txt.substring(ix_trailer + 2)} `;
    } else {
      bitmark = ` ==${txt}==|link:${href}|`;
    }
  } else if (href.includes("fscxeditor://xeditordocument/self?")) {
    // internal link
    let anchorId = visitor.transformer.getAnchorForCustId(
      extractCustomerIdFromXlinkHref(href)
    );
    if (anchorId && anchorId.includes("ref_")) {
      // special: ref must point to parent = ref_list, because ref is not its own Element/Bit
      anchorId = visitor.transformer.getParentAnchorForCustId(
        extractCustomerIdFromXlinkHref(href)
      );
    }
    if (!anchorId) {
      CONFIG.logger.warn(TransformerLogger.CATEGORY.LINK, "linkNoAnchorId(self)", "href: " + href);
    }
    return formatInternalLink(txt, anchorId);
  } else if (href.includes("fscxeditor://xeditordocument/")) {
    // is... xlink:href=""fscxeditor://xeditordocument/<COO-ID>?xpath=//*[local-name()='<element>'][@*[local-name()='id' and .= <ID>']]"
    gmbDocId = visitor.transformer.getGmbDocId(href);
    if (visitor.transformer.docIdExistsInSpecificMapping(href)) {
      // internal link may be defined as external link
      // check if documentID is part of this current document
      // if yes then handle as internal link
      let anchorId = visitor.transformer.getAnchorForCustId(
        extractCustomerIdFromXlinkHref(href)
      );
      if (anchorId && anchorId.includes("ref_")) {
        // special: ref must point to parent = ref_list, because ref is not its own Element/Bit
        anchorId = visitor.transformer.getParentAnchorForCustId(
          extractCustomerIdFromXlinkHref(href)
        );
      }
      if (!anchorId) {
        CONFIG.logger.warn(TransformerLogger.CATEGORY.LINK, "linkNoAnchorId", "href: " + href);
      }
      return formatInternalLink(txt, anchorId);
    }
    gmbAnchor = visitor.transformer.getAnchorForCustId(href);
    if (gmbDocId === "notdefined") {
      // no mapping available for document yet because not yet provided
      bitmark = ` ==${txt}==|xref:|►undef`;
      CONFIG.logger.warn(TransformerLogger.CATEGORY.LINK, "linkNoMappig", "href: " + href);
    } else if (ix_trailer > -1) {
      // label has Italic and/or Bold expression
      bitmark = ` ==${txt.substring(
        2,
        ix_trailer
      )}==|xref:${gmbDocId}|►${gmbAnchor}|${txt.substring(ix_trailer + 2)} `;
    } else {
      bitmark = ` ==${txt}==|xref:${gmbDocId}|►${gmbAnchor}|`;
    }
  } else {
    CONFIG.logger.warn(TransformerLogger.CATEGORY.LINK, "linkNoMappigUndefined", "customerId: " + node.customerId);
    bitmark = ` ==${txt}==|xref:|►undef`;
  }

  return bitmark;
};

const inlineGraphic = (node, visitor) => {
  const bmInlineGraphicBuilder = new BitmarkInlineGraphicBuilder(
    CONFIG.localRessourcePath,
    CONFIG.uploadPostUrl,
    CONFIG.ressourceBaseUrl
  );
  return bmInlineGraphicBuilder.build(node);
};

const getAnchorAndCustomerId = (node, visitor) => {
  if (node.overloadAnchorId || node.overloadCustomerId) {
    // overloadAnchorId and overloadCustomerId are used for sec_type_paragraph
    if (!node.overloadAnchorId || !node.overloadCustomerId) {
      CONFIG.logger.warn(TransformerLogger.CATEGORY.LINK, "NoCustomerId(overload)", "overloadAnchorId: " + node.overloadAnchorId);
    }
    return [
      node.overloadAnchorId ? node.overloadAnchorId : "no_anchorId",
      node.overloadCustomerId ? node.overloadCustomerId : "no_customerId",
    ];
  }
  if (!node.customerId) {
    CONFIG.logger.warn(TransformerLogger.CATEGORY.LINK, "NoCustomerId", "anchorId: " + node.anchorId);
  }
  return [node.anchorId, node.customerId ? node.customerId : "no_customerId"];
};

function processParagraph(node, visitor, listlevel = 1) {
  let paragraphTextByRef = {
    text: "",
    fontStyles: [],
    searchTerms: [],
    customerId: node.customerId,
  };
  processParagraphRecursion(node, paragraphTextByRef, visitor, listlevel);
  node.searchTerms = paragraphTextByRef.searchTerms;
  node.customerId = paragraphTextByRef.customerId; // customerId from "textfragment" --> guaranteed unique
  return paragraphTextByRef.text;
}

function processParagraphRecursion(
  node,
  paragraphTextByRef,
  visitor,
  listlevel
) {
  let startNodeReached = !node.startNode ? true : false;
  for (const child of node.children) {
    // check if startNode is reached
    if (!startNodeReached && node.startNode) {
      if (child.uuid !== node.startNode.uuid) {
        continue; // skip Elements before startNode
      }
      if (child.uuid === node.startNode.uuid) {
        startNodeReached = true;
        continue; // skip startNode too
      }
    }

    child.setBitmarkProperties(node);
    if (child.name === "textfragment" && child.plaintext.length > 0) {
      // remove duplicates styles
      paragraphTextByRef.fontStyles = paragraphTextByRef.fontStyles.reduce(
        function (a, b) {
          if (a.indexOf(b) < 0) a.push(b);
          return a;
        },
        []
      );
      // add styles to text
      paragraphTextByRef.text = paragraphTextByRef.text
        .concat(paragraphTextByRef.fontStyles.length > 0 ? "==" : "")
        .concat(child.plaintext)
        .concat(child.plaintext.slice(-1) === " " ? "" : " ")
        .concat(paragraphTextByRef.fontStyles.length > 0 ? "==|" : "");
      while (paragraphTextByRef.fontStyles.length > 0) {
        paragraphTextByRef.text = paragraphTextByRef.text
          .concat(paragraphTextByRef.fontStyles.pop())
          .concat("|");
      }
      paragraphTextByRef.text = paragraphTextByRef.text.trim().concat(" "); // check if needed
      paragraphTextByRef.customerId = child.customerId; // set customerId from "textfragment" --> guaranteed unique if multiple textfragments and complex <p> structure
    } else if (checkIfComplexStructure(child)) {
      // Complex Structure, e.g. boxed-text, fig, table-wrap, ... split in separate bit
      // stop processing at this point
      node.startNode = child;
      break;
    } else if (
      child.name === "bold" ||
      child.name === "italic" ||
      child.name === "underline" ||
      child.name === "strike"
    ) {
      // Inline Emphasis Elements
      if (child.name === "underline") {
        // show underline as bold
        child.name = "bold";
      } else if (child.name === "strike") {
        // strike is userStrike in bitmark
        child.name = "userStrike";
      }
      paragraphTextByRef.fontStyles.push(child.name);
      processParagraphRecursion(child, paragraphTextByRef, visitor);
    } else if (child.name === "uri") {
      paragraphTextByRef.text = paragraphTextByRef.text.concat(
        //processUri(child, visitor)
        external_link(child, visitor)
      );
    } else if (child.name === "break") {
      // line break
      paragraphTextByRef.text = paragraphTextByRef.text.concat("\n");
    } else if (child.name === "private-char") {
      const symbol = private_char(child);
      paragraphTextByRef.text = paragraphTextByRef.text.concat(symbol);
    } else if (child.name === "index-term") {
      paragraphTextByRef.searchTerms.push(index_term(child, visitor));
    } else if (child.name === "math") {
      const url = generateDisplayFormula(child);
      paragraphTextByRef.text = paragraphTextByRef.text.concat(url);
    } else if (child.name === "table-wrap") {
      CONFIG.logger.warn(TransformerLogger.CATEGORY.CONTENT, "TableWrapInParagraph", child.customerId);
      " !!" + child.name + ": " + child.plaintext + "!! ";
    } else if (child.name === "fig") {
      CONFIG.logger.warn(TransformerLogger.CATEGORY.CONTENT, "FigInParagraph", child.customerId);
      paragraphTextByRef.text = paragraphTextByRef.text.concat(
        " !!" + child.name + ": " + child.plaintext + "!! "
      );
    } else if (child.name === "boxed-text") {
      CONFIG.logger.warn(TransformerLogger.CATEGORY.CONTENT, "BoxedTextInParagraph", child.customerId);
      " !!" + child.name + ": " + child.plaintext + "!! ";
    } else if (child.name === "inline-formula") {
      const url = generateDisplayFormula(child);
      if (CONFIG.featureFlagUseLatex) {
        paragraphTextByRef.text = paragraphTextByRef.text.concat(url);
      } else {
        paragraphTextByRef.text = paragraphTextByRef.text.concat(
          bmTemplates.imageInline(url, 25, 19)
        );
      }
    } else if (child.name === "disp-formula") {
      const url = generateDisplayFormula(child);
      if (CONFIG.featureFlagUseLatex) {
        paragraphTextByRef.text = paragraphTextByRef.text.concat(url);
      } else {
        paragraphTextByRef.text = paragraphTextByRef.text.concat(
          bmTemplates.imageInline(url, 200, 100)
        );
      }
      // check:
      // legend
      const legendNode = findFirstChild(child, "legend");
      if (legendNode) {
        const titleNode = findFirstChild(legendNode, "title");
        const title = titleNode ? titleNode.plaintext : "";
        const defListNode = findFirstChild(legendNode, "def-list");
        const txt =
          (title.length > 0 ? `==${title}==|bold|` : "") +
          processDefListInline(defListNode, visitor);
        if (txt && txt.length > 0) {
          paragraphTextByRef.text = paragraphTextByRef.text.concat(txt);
        }
        if (visitor) {
          visitor.markVisited(titleNode);
          visitor.markVisited(legendNode);
          visitor.markVisited(defListNode);
        }
      }
    } else if (child.name === "sub") {
      // subscript
      paragraphTextByRef.text = paragraphTextByRef.text
        .trim()
        .concat("==" + child.plaintext + "==|subscript| ");
    } else if (child.name === "sup") {
      // superscript
      paragraphTextByRef.text = paragraphTextByRef.text
        .trim()
        .concat("==" + child.plaintext + "==|superscript| ");
    } else if (child.name === "list") {
      const txt = processList(child, visitor, listlevel);
      if (txt != null && txt.length > 0) {
        paragraphTextByRef.text = paragraphTextByRef.text.concat(txt);
      }
    } else if (child.name === "def-list") {
      const txt = processDefListInline(child, visitor);
      if (txt != null && txt.length > 0) {
        paragraphTextByRef.text = paragraphTextByRef.text.concat(txt);
      }
    } else if (child.name === "inline-graphic") {
      const inlg = inlineGraphic(child, visitor);
      paragraphTextByRef.text = paragraphTextByRef.text.concat(inlg);
    } else if (child.name === "ext-link") {
      const ref = external_link(child, visitor);
      paragraphTextByRef.text = paragraphTextByRef.text.concat(ref);
    } else if (child.name === "xref" && child.attributes["ref-type"] === "fn") {
      // footnote, handle <fn> node as well
      const fn = footnote(child, node, visitor);
      paragraphTextByRef.text = paragraphTextByRef.text.trim().concat(fn);
    } else if (child.name === "fn") {
      // overread fn (footnote)
    } else if (child.name === "xref" && child.attributes["ref-type"] != "fn") {
      // ignore footnotes, internal, table, fig, sec ...
      const ref = internal_link(child, visitor);
      paragraphTextByRef.text = paragraphTextByRef.text.concat(ref);
    } else {
      CONFIG.logger.warn(TransformerLogger.CATEGORY.CONTENT, "UnknownElementInParagraph", child.customerId);
      paragraphTextByRef.text = paragraphTextByRef.text.concat(
        " !!" + child.name + ": " + child.plaintext + "!! "
      );
    }
    if (visitor) {
      visitor.markVisited(child);
    }
  }
}
function processUri(node, visitor) {
  const txt = processParagraph(node, visitor);
  const href = node.attributes["xlink:href"];
  return ` ==${txt}==|link:${href}|`;
}

// processList is called from ListVisitor, procsses the list recursvively and returns the text
function processList(listNode, visitor, level, currentPath = "") {
  if (checkIfComplexStructure(listNode)) {
    // each list-item as separate bit
    visitor.markVisited(listNode);
    for (const listItem of listNode.children) {
      listItem.setBitmarkProperties(listNode); // check:setBitmarkProperties
      // list-item
      const labelNode = findFirstChild(listItem, "label"); // todo: label handling
      for (const el of listItem.children) {
        if (el.name != "label") {
          el.setBitmarkProperties(listItem); // check:setBitmarkProperties
          processNode(el, visitor, currentPath);
        }
      }
    }
    return null;
  }
  let listTextByRef = { text: "" };
  listItemRecursion(listNode, visitor, listTextByRef, level);
  return listTextByRef.text;
}

// checkForParaphWithList: checks if List contains a 1{<p> <list>}n sequence
function checkIfKomplexList(listNode, visitor, level) {
  const items = [];
  const listType = listNode.attributes["list-type"];
  const styleDetail = listNode.attributes["style-detail"];
  // simple

  var listItems = [];
  var match = false;

  for (const listItem of listNode.children) {
    let nofP = 0;
    let nofList = 0;
    let nofKomplexElements = 0;
    if (listItem.name === "list-item") {
      for (const el of listItem.children) {
        // element of list-item
        if (listType === "order") {
          nofP = el.name === "p" ? nofP + 1 : nofP;
          nofList = el.name === "list" ? nofList + 1 : nofList;
        }
        nofKomplexElements = checkIfComplexStructure(el)
          ? nofKomplexElements + 1
          : nofKomplexElements;
        nofKomplexElements =
          el.name === "boxed-text"
            ? nofKomplexElements + 1
            : nofKomplexElements;
        nofKomplexElements =
          el.name === "fig" ? nofKomplexElements + 1 : nofKomplexElements;
        nofKomplexElements =
          el.name === "notes-group"
            ? nofKomplexElements + 1
            : nofKomplexElements;
        nofKomplexElements =
          findFirstChild(el, "disp-formula") !== null ||
            el.name === "disp-formula"
            ? nofKomplexElements + 1
            : nofKomplexElements;

        nofKomplexElements =
          findFirstChild(el, "inline-formula") !== null ||
            el.name === "inline-formula"
            ? nofKomplexElements + 1
            : nofKomplexElements;
        nofKomplexElements =
          findFirstChild(el, "table-wrap") !== null || el.name === "table-wrap"
            ? nofKomplexElements + 1
            : nofKomplexElements;
      }
      listItems.push(listItem);
      if ((nofP > 0 && nofList > 0) || nofKomplexElements > 0) {
        match = true;
      }
    }
  }
  return match ? listItems : [];
}

function listItemRecursion(listNode, visitor, listTextByRef, level) {
  const listType = listNode.attributes["list-type"];
  const styleDetail = listNode.attributes["style-detail"];

  for (const listItem of listNode.children) {
    visitor.markVisited(listItem);
    if (listItem.name === "list-item") {
      var content = "";
      var firstEl = true;
      for (const el of listItem.children) {
        el.setBitmarkProperties(listItem); // check:setBitmarkProperties
        visitor.markVisited(el);

        if (el.name === "label") {
          // ignore label
          // <label>a)</label> overread in case of alpha-lower or alpha-upper
        } else if (el.name === "p") {
          content = content
            .concat(firstEl ? "" : " ")
            .concat(processParagraph(el, visitor, level + 1)); // check!!
          firstEl = false;
        } else if (el.name === "list") {
          // recursive call, multiple nested lists
          const nextLevel = level + 1;
          const txt = processList(el, visitor, nextLevel);
          if (txt != null) {
            content = content.concat(txt);
          }
          firstEl = false;
        } else {

        }
      }
      //end of listItem.children
      if (listType === "bullet") {
        // @style-detail "dash" etc not considered
        listTextByRef.text = listTextByRef.text.concat(
          bmTemplates.listItemBullet(level, content)
        );
      } else if (listType === "alpha-lower") {
        listTextByRef.text = listTextByRef.text.concat(
          bmTemplates.listItemAlphaLower(level, content)
        );
      } else if (listType === "alpha-upper") {
        listTextByRef.text = listTextByRef.text.concat(
          bmTemplates.listItemAlphaUpper(level, content)
        );
      } else if (listType === "simple") {
        listTextByRef.text = listTextByRef.text.concat(
          bmTemplates.listItemSimple(level, content)
        );
      } else if (listType === "order") {
        listTextByRef.text = listTextByRef.text.concat(
          bmTemplates.listItemNumbered(level, content)
        );
      } else if (listType === "dash") {
        //"-"
        listTextByRef.text = listTextByRef.text.concat(
          bmTemplates.listItemBullet(level, content)
        );
      } else {
        listTextByRef.text = listTextByRef.text.concat(
          bmTemplates.listItemBullet(level, content)
        );
      }

      firstEl = false;
    } // end of listItem
  }
}
//
function processCaptionParagraphs(captioNode, visitor) {
  let txt = "";
  for (const el of captioNode.children) {
    if (el.name === "p") {
      el.setBitmarkProperties(captioNode);
      visitor.markVisited(el);
      if (txt.length > 0) {
        txt = txt.concat("\n");
      }
      txt = txt.concat(processParagraph(el, visitor));
    }
  }
  if (txt.length > 0) {
    // write caption as instruction
    writeArticleOrNote(captioNode, txt, visitor, true);
  }
}

function processNodeAsParagraph(node, visitor, currentPath) {
  node.name = "p";
  processNode(node, visitor, currentPath);
}

function processNode(node, visitor, currentPath) {
  const visitorN = getVisitorForNode(
    node,
    visitor.visitedNodes,
    visitor.transformer,
    node
  );
  node.accept(visitorN, currentPath);
  visitor.markVisited(node);
}

function processTermSecSplitted(termSecNode, visitor, currentPath) {
  visitor.markVisited(termSecNode);
  for (const termDisplay of termSecNode.children) {
    // Term-display

    for (const termEl of termDisplay.children) {
      if (termEl.name === "term") {
        processNodeAsParagraph(termEl, visitor, currentPath);
      } else if (termEl.name === "def") {
        // process nodes separately
        for (const n of termEl.children) {
          n.setBitmarkProperties(termSecNode); // check:setBitmarkProperties
          processNode(n, visitor, currentPath);
        }
      } else {
        CONFIG.logger.warn(TransformerLogger.CATEGORY.CONTENT, "UnknownElementInTermSec", termSecNode.customerId);
        termDisplTxt =
          termDisplTxt + "!! UNKNOWN TermSec Splitted " + termEl.name + "!!";
      }
      visitor.markVisited(termEl);
    }
  }
}

function processTermSec(termSecNode, visitor) {
  var termSecListTxt = "";
  visitor.markVisited(termSecNode);

  for (const termDisplay of termSecNode.children) {
    // Term-display
    visitor.markVisited(termDisplay);
    var termDisplTxt = "•_ ";
    var term = "";
    var def = "";
    for (const termEl of termDisplay.children) {
      visitor.markVisited(termEl);
      if (termEl.name === "term") {
        // todo: term bold
        term = processParagraph(termEl, visitor, 2);
      } else if (termEl.name === "def") {
        for (const n of termEl.children) {
          if (n.name === "p") {
            def = def + processParagraph(n, visitor, 2);
          } else {
            // create pseudo node and process content as paragraph
            const pseudoPNode = new NINNode(n);
            pseudoPNode.children = [n];
            def = def + processParagraph(pseudoPNode, visitor, 2);
          }
        }
      } else {
        CONFIG.logger.warn(TransformerLogger.CATEGORY.CONTENT, "UnknownElementInTermSec", termSecNode.customerId);
        termDisplTxt =
          termDisplTxt + "!! UNKNOWN TermSec " + termEl.name + "!!";
      }
    }
    // ** bold

    if (term.indexOf("|") == -1) {
      termDisplTxt =
        termDisplTxt +
        "==" +
        term +
        "==|bold|" +
        (term.length > 0 ? ":\n" : "") +
        def;
    } else {
      // bold not possible **TEXT**|bold|
      termDisplTxt = termDisplTxt + term + (term.length > 0 ? ":\n" : "") + def;
    }

    termSecListTxt = termSecListTxt + "\n" + termDisplTxt;
  }
  return termSecListTxt;
}

/*  
    <ref id="ref_5_SNG4910002097ade">
        <label>[5]</label>
        <mixed-citation>Douglas J. Reinemann, «Literature review and synthesis of research findings on the impact of stray voltage on farm operations», Prepared for the Ontario Energy Board, 31 March 2008.</mixed-citation>
    </ref>
*/
function processRefList(refListNode, visitor) {
  var refListTxt = "";
  visitor.markVisited(refListNode);

  for (const refItem of refListNode.children) {
    // <ref> || <title>
    visitor.markVisited(refItem);
    if (refItem.name === "title") {
      const title = processParagraph(refItem, visitor);
      refListTxt = refListTxt + title + ":";
      continue;
    }
    var refItemTxt = "• ";
    var stdRef = "";
    var title = "";
    for (const refItemChild of refItem.children) {
      visitor.markVisited(refItemChild);
      if (refItemChild.name === "std") {
        for (const childNode of refItemChild.children) {
          if (childNode.name === "std-ref") {
            stdRef = processParagraph(childNode, visitor, 2);
          } else if (childNode.name === "title") {
            // create pseudo node and process content as paragraph
            title = processParagraph(childNode, visitor, 2);
          }
        }
        refItemTxt =
          refItemTxt + stdRef + (stdRef.length > 0 ? " : " : "") + title;
      } else if (refItemChild.name === "label") {
        // <label>[5]</label>
        refItemTxt =
          refItemTxt +
          refItemChild.plaintext +
          (refItemChild.plaintext.length > 0 ? " " : "");
      } else if (refItemChild.name === "mixed-citation") {
        stdRef = processParagraph(refItemChild, visitor, 2);
        refItemTxt = refItemTxt + stdRef;
      } else {
        CONFIG.logger.warn(TransformerLogger.CATEGORY.CONTENT, "UnknownElementInRefList", refListNode.customerId);
        refItemTxt =
          refItemTxt + "!! UNKNOWN RefList " + refItemChild.name + "!!";
      }
    }
    refListTxt = refListTxt + "\n" + refItemTxt;
  }
  return refListTxt;
}

function processRefListAsLegend(refListNode, visitor) {
  const legend = new BitmarkLegendBuilder();
  const bmInlineGraphicBuilder = new BitmarkInlineGraphicBuilder(
    CONFIG.localRessourcePath,
    CONFIG.uploadPostUrl,
    CONFIG.ressourceBaseUrl
  );
  var refListTxt = "";
  visitor.markVisited(refListNode);

  for (const refItem of refListNode.children) {
    // <ref> || <title>
    visitor.markVisited(refItem);
    if (refItem.name === "title") {
      legend.setTitle(processParagraph(refItem, visitor, 2));
      continue;
    }
    var stdRef = "";
    var title = "";
    var label = "";
    for (const refItemChild of refItem.children) {
      visitor.markVisited(refItemChild);
      if (refItemChild.name === "std") {
        for (const childNode of refItemChild.children) {
          if (childNode.name === "std-ref") {
            stdRef = processParagraph(childNode, visitor, 2);
          } else if (childNode.name === "title") {
            // create pseudo node and process content as paragraph
            title = processParagraph(childNode, visitor, 2);
          }
        }
        legend.addDefItem("- " + stdRef + ":", title);
      } else if (refItemChild.name === "label") {
        // <label>[5]</label>
        label = refItemChild.plaintext;
        stdRef = ""; // reset stdRef
      } else if (refItemChild.name === "mixed-citation") {
        stdRef = processParagraph(refItemChild, visitor, 2);
        legend.addDefItem(label.length === 0 ? "- " : label, stdRef);
        label = ""; // reset label
      } else {
        legend.addDefItem("???????", "??? unknown");
      }
    }
  }
  return legend.buildBit();
}

function processDefList(defListNode, visitor) {
  const legend = new BitmarkLegendBuilder();
  const bmInlineGraphicBuilder = new BitmarkInlineGraphicBuilder(
    CONFIG.localRessourcePath,
    CONFIG.uploadPostUrl,
    CONFIG.ressourceBaseUrl
  );
  visitor.markVisited(defListNode);

  for (const defItem of defListNode.children) {
    if (defItem.name === "title") {
      legend.setTitle(processParagraph(defItem, visitor, 2));
      visitor.markVisited(defItem);
      continue;
    }
    visitor.markVisited(defItem);
    let termTxt = "";
    let defTxt = "";
    for (const el of defItem.children) {
      visitor.markVisited(el);
      if (el.name === "term") {
        for (const n of el.children) {
          //todo: inline-graphic
          if (n.name === "p") {
            termTxt += processParagraph(n, visitor, 2);
          } else if (n.name === "inline-graphic") {
            termTxt += bmInlineGraphicBuilder.build(n);
          } else {
            // Text without <p> tag
            // create pseudo node and process content as paragraph
            const pseudoPNode = new NINNode(n);
            pseudoPNode.children = [n];
            termTxt += processParagraph(pseudoPNode, visitor, 2);
          }
        }
      } else if (el.name === "def") {
        // contains paragraph
        for (const n of el.children) {
          if (n.name === "p") {
            defTxt += processParagraph(n, visitor, 2);
          } else {
            // Text without <p> tag
            // create pseudo node and proqess content as paragraph
            const pseudoPNode = new NINNode(n);
            pseudoPNode.children = [n];
            defTxt += processParagraph(pseudoPNode, visitor, 2);
          }
        }
      } else {
        CONFIG.logger.warn(TransformerLogger.CATEGORY.CONTENT, "UnknownElementInDefList", defListNode.customerId);
        defTxt += "!! UNKNOWN DefList " + el.name + "!!";
      }
    }
    legend.addDefItem(termTxt, defTxt);
  }

  return legend.buildBit();
}

function processDefListInline(defListNode, visitor) {
  var defListTxt = "";
  visitor.markVisited(defListNode);

  for (const defItem of defListNode.children) {
    if (defItem.name === "title") {
      // skip titles
      continue;
    }
    visitor.markVisited(defItem);
    var defItemTxt = "•_ ";
    for (const el of defItem.children) {
      visitor.markVisited(el);
      if (el.name === "term") {
        for (const n of el.children) {
          //todo: inline-graphic
          if (n.name === "p") {
            defItemTxt = defItemTxt + processParagraph(n, visitor, 2);
          } else {
            // create pseudo node and process content as paragraph
            const pseudoPNode = new NINNode(n);
            pseudoPNode.children = [n];
            defItemTxt = defItemTxt + processParagraph(pseudoPNode, visitor, 2);
          }
        }
        defItemTxt =
          defItemTxt +
          (defItemTxt.length > 0 && defItemTxt.lastIndexOf(":") === -1
            ? " : "
            : "");
      } else if (el.name === "def") {
        // contains paragraph
        for (const n of el.children) {
          if (n.name === "p") {
            defItemTxt = defItemTxt + processParagraph(n, visitor, 2);
          } else {
            // create pseudo node and proqess content as paragraph
            const pseudoPNode = new NINNode(n);
            pseudoPNode.children = [n];
            defItemTxt = defItemTxt + processParagraph(pseudoPNode, visitor, 2);

          }
        }
      } else if (el.name === "inline-graphic") {
        defItemTxt = defItemTxt + inlineGraphic(el, visitor);
      } else {
        CONFIG.logger.warn(TransformerLogger.CATEGORY.CONTENT, "UnknownElementInDefList", defListNode.customerId);
        defItemTxt = defItemTxt + "!! UNKNOWN DefList " + el.name + "!!";
      }
    }
    defListTxt = defListTxt + "\n" + defItemTxt;
  }
  return defListTxt;
}

/* to do
[.standard-remark-table-normative]
[.standard-remark-table-non-normative]
*/
function writeTable(node, lable, title, rawTxt, url, visitor) {
  // remarkTable
  if (node.isRemark) {
    visitor.writeToFile(
      bmTemplates.standardRemarkTable(
        lable ? lable : "",
        title ? title : "",
        "",
        rawTxt,
        getAnchorAndCustomerId(node, visitor),
        url,
        node.isBoxedtext === true || !node.isNormative,
        CONFIG.lang
      )
    );
  } else {
    visitor.writeToFile(
      bmTemplates.standardTable(
        lable ? lable : "",
        title ? title : "",
        "",
        rawTxt,
        getAnchorAndCustomerId(node, visitor),
        url,
        node.isBoxedtext === true || !node.isNormative,
        CONFIG.lang
      )
    );
  }
}
/*
  label = "",
  title = "",
  legend = "",
  url = "",
  width = 1024,
  height = 472,
  anchor = "",
  non_normative = false
*/
function writeImageFigure(
  node,
  lable,
  title,
  legend,
  url,
  width,
  height,
  visitor
) {
  if (node.isRemark) {
    visitor.writeToFile(
      bmTemplates.figureRemark(
        lable ? lable : "",
        title,
        legend,
        url,
        width,
        height,
        getAnchorAndCustomerId(node, visitor),
        CONFIG.lang
      )
    );
  } else {
    visitor.writeToFile(
      bmTemplates.standardImageFigure(
        lable ? lable : "",
        title,
        legend,
        url,
        width,
        height,
        getAnchorAndCustomerId(node, visitor),
        node.isBoxedtext === true || !node.isNormative,
        CONFIG.lang
      )
    );
  }
}

function writeDislayFormula(
  node,
  content,
  visitor,
  showTitleAsInstruction = false,
  lang = CONFIG.lang
) {
  visitor.writeToFile(
    bmTemplates.formula(
      node.label ? node.label : "",
      node.title ? node.title : "",
      content,
      getAnchorAndCustomerId(node, visitor),
      node.getSearchTerms(),
      node.isBoxedtext === true || !node.isNormative,
      showTitleAsInstruction,
      CONFIG.lang
    )
  );
  node.label = ""; // reset label (item)
  node.title = ""; // reset title (lead)
  node.searchTerms = []; // reset search terms
}

function writeLegend(node, content, visitor, showTitleAsInstruction = false) {
  visitor.writeToFile(
    bmTemplates.legend(
      node.label ? node.label : "",
      node.title ? node.title : "",
      content,
      getAnchorAndCustomerId(node, visitor),
      node.getSearchTerms(),
      node.isBoxedtext === true || !node.isNormative,
      showTitleAsInstruction,
      CONFIG.lang
    )
  );
  node.label = ""; // reset label (item)
  node.title = ""; // reset title (lead)
  node.searchTerms = []; // reset search terms
}

function writeArticleOrNote(
  node,
  content,
  visitor,
  showTitleAsInstruction = false
) {
  if (!content || content.length === 0) {
    return;
  }
  if (node.isRemark) {
    visitor.writeToFile(
      bmTemplates.standardRemark(
        node.label ? node.label : "",
        node.title ? node.title : "",
        content,
        getAnchorAndCustomerId(node, visitor),
        node.getSearchTerms(),
        node.isBoxedtext === true || !node.isNormative,
        showTitleAsInstruction,
        CONFIG.lang
      )
    );
  } else if (node.isNormative === true) {
    visitor.writeToFile(
      bmTemplates.standardArticle(
        node.label ? node.label : "",
        node.title ? node.title : "",
        content,
        getAnchorAndCustomerId(node, visitor),
        node.getSearchTerms(),
        node.isBoxedtext === true || !node.isNormative,
        showTitleAsInstruction,
        CONFIG.lang
      )
    );
  } else {
    visitor.writeToFile(
      bmTemplates.standardNote(
        node.label ? node.label : "",
        node.title ? node.title : "",
        content,
        getAnchorAndCustomerId(node, visitor),
        node.getSearchTerms(),
        node.isBoxedtext === true || !node.isNormative,
        showTitleAsInstruction,
        CONFIG.lang
      )
    );
  }

  node.label = ""; // reset label (item)
  node.title = ""; // reset title (lead)
  node.searchTerms = []; // reset search terms
}
function getChild(node, ix) {
  if (!node || !node.children) {
    return null;
  }
  return node.children[ix];
}

function processIndexTerms(parentNode, node, visitor) {
  const terms = [];
  if (!node || !node.children) {
    return;
  }
  // todo: search recursively for index-term
  for (const child of node.children) {
    if (child.name === "index-term") {

      parentNode.searchTerms.push(index_term(child, visitor));
      visitor.markVisited(child);
    }
  }
}

// Visitor Interface
class IVisitor {
  constructor(
    visitedNodes,
    transformer,
    isContainer = false,
    parentNode = null
  ) {
    this.visitedNodes = visitedNodes;
    this.transformer = transformer;
    this.isContainer = isContainer;
    this.parentNode = null;
  }

  visit(node, path) {
    throw new Error("This method should be overridden!");
  }

  // Helper method to track and check if a node has been visited
  markVisited(node) {
    if (!node) {
      return true;
    }
    const nodeIdentifier = this.getNodeIdentifier(node);
    if (this.visitedNodes.has(nodeIdentifier)) {
      return false;
    }
    this.visitedNodes.add(nodeIdentifier);
    return true;
  }
  isVisited(node) {
    const nodeIdentifier = this.getNodeIdentifier(node);
    return this.visitedNodes.has(nodeIdentifier);
  }
  allChildrenVisited(node) {
    return node.children.every((child) => this.isVisited(child));
  }
  getNodeIdentifier(node) {
    return node.uuid;
  }
  writeToFile(data) {
    if (this.transformer) {
      this.transformer.writeToFile(data);
    }
  }
}

// Concrete Visitor for "Sec" nodes
class SecVisitor extends IVisitor {
  visit(node, visitpath) {
    if (!this.markVisited(node)) {
      return;
    }
    node.isContainer = this.isContainer;
    const labelNode = findFirstChild(node, "label");
    const titleNode = findFirstChild(node, "title");
    var label = labelNode ? labelNode.plaintext : "";
    this.markVisited(labelNode);
    //var title = titleNode ? titleNode.plaintext : "";

    var title = "";
    if (titleNode) {
      processIndexTerms(node, titleNode, this);
      title = processParagraph(titleNode, this);
      this.markVisited(titleNode);
      title = title.trim();
    }

    // It may be that TitleNode also contains index terms
    // these should also be saved in the parent node
    processIndexTerms(node, labelNode, this);

    this.transformer.writeToFile(
      bmTemplates.chapter(
        node.seclevel >= 0 ? node.seclevel : 0,
        label,
        title,
        getAnchorAndCustomerId(node, this),
        node.getSearchTerms(),
        CONFIG.lang
      )
    );

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;



    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
      }
    }
  }
}

// Concrete Visitor for general nodes
class SubPartVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }

    node.isContainer = this.isContainer;
    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;

    const labelNode = findFirstChild(node, "label");

    // SNG49: SNG 491000 comprises various rules (sheets). each rule has individual metadata (std-meta).
    // check if node has <std-meta< metadata. if metadata exists, it is a SNG 491000 rule

    const stdmetaNode = findFirstChild(node, "std-meta");
    if (stdmetaNode) {
      //!!!!!!
      // is SNG 491000 rule to Start a new Sheet
      // Handle std_ref_dated and std_xref_supersedes
      // do not write a chapter but propagate the anchorId and customerId
      stdmetaNode.anchorId = node.anchorId; // set anchorId for std-meta
      stdmetaNode.customerId = node.customerId; // set customerId for std-meta
    } else {
      // is NIN, not a SNG 491000 rule
      const titleNode = findFirstChild(node, "title");
      var label = labelNode ? labelNode.plaintext : "";
      var title = titleNode ? titleNode.plaintext : "";
      this.markVisited(labelNode);
      this.markVisited(titleNode);

      this.writeToFile(
        bmTemplates.chapter(
          node.seclevel,
          label,
          title,
          getAnchorAndCustomerId(node, this),
          "",
          CONFIG.lang
        )
      );
    }

    // Handle children
    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
      }
    }
  }
}

// Concrete Visitor for general nodes
class PrintVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }
    node.isContainer = this.isContainer;
    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;



    // Handle children
    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
      }
    }
  }
}
class LegendVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }
    node.isContainer = this.isContainer;
    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    const defListNode = findFirstChild(node, "def-list");
    this.markVisited(defListNode);

    if (defListNode) {
      let legendtxt = processDefList(defListNode, this);
      writeLegend(node, legendtxt, this);
    }

    // Handle children
    for (let child of node.children) {
      child.setBitmarkProperties(node);
      this.markVisited(child); // Set child as visited
    }
  }
}

/* Concrete Visitor for "Ref" nodes
 "standand alone" ref-nodes (not part of a ref-list) can be linked through anchorid   
*/
class RefVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }
    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    const labelNode = findFirstChild(node, "label");
    this.markVisited(labelNode);
    node.label = processParagraph(labelNode, this, 2);

    const mixedcitationNode = findFirstChild(node, "mixed-citation");
    this.markVisited(mixedcitationNode);
    const text = processParagraph(mixedcitationNode, this, 2);

    // check
    writeArticleOrNote(node, text, this, true);

    // Handle children
    for (let child of node.children) {
      child.setBitmarkProperties(node);
      this.markVisited(child); // Set child as visited
    }
  }
}
class RefListVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }
    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    let legendtxt = "";
    if (node) {
      legendtxt = processRefList(node, this);
    }
    writeArticleOrNote(node, legendtxt, this);

    // Handle children
    for (let child of node.children) {
      child.setBitmarkProperties(node);
      this.markVisited(child); // Set child as visited
    }
  }
}

class DefListVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }

    node.isContainer = this.isContainer;
    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    let legendtxt = processDefList(node, this);
    writeLegend(node, legendtxt, this);

    // Handle children
    for (let child of node.children) {
      child.setBitmarkProperties(node);
      this.markVisited(child); // Set child as visited
    }
  }
}

class TermSecVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }
    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    if (checkIfComplexStructure(node)) {
      // contains notes-group etc --> splitt in to <paragraph> and <notes-group> etc
      processTermSecSplitted(node, this, currentPath);
    } else {
      let legendtxt = "";
      if (node) {
        legendtxt = processTermSec(node, this);
      }
      // check
      writeArticleOrNote(node, legendtxt, this);
    }

    // Handle children
    for (let child of node.children) {
      child.setBitmarkProperties(node);
      this.markVisited(child); // Set child as visited
    }
  }
}

function generateDisplayFormula(node) {
  const id = node.attributes["id"];
  const ts = Date.now();
  const filePath =
    "./tmp/disp_formula_" + (id ? id : uuidv4()) + "_" + ts + ".svg";
  const url = CONFIG.ressourceBaseUrl + path.basename(filePath);

  const data = extractMathML(node);

  if (CONFIG.featureFlagUseLatex) {
    return new MML2LaTeX().transform(data);
  } else {
    new MML2SVG()
      .transform(data, filePath, 230, 230 / 1.618 / 2)
      .then((svgPath) => {
        Utils.publishImage(svgPath, path.basename(svgPath));
      });
  }
  return url;
}

class InlineFormulaVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    const content = generateDisplayFormula(node);
    if (CONFIG.featureFlagUseLatex) {
      writeDislayFormula(node, content, this, false);
    } else {
      writeImageFigure(node, "", "", content, 230, 10, this);
    }

    // Handle children
    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
        this.markVisited(child); // Set child as visited
      }
    }
  }
}
//
class DispFormulaVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    const content = generateDisplayFormula(node);

    if (CONFIG.featureFlagUseLatex) {
      writeDislayFormula(node, content, this, false);
    } else {
      writeImageFigure(node, "", "", content, 230, 10, this);
    }

    // Handle children
    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
        this.markVisited(child); // Set child as visited
      }
    }
  }
}

// Concrete Visitor for "Xref" nodes (no action, just print the node name and plaintext)
class XrefVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    //internalLink

    // Handle children
    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
      }
    }
  }
}

// Concrete Visitor for index-term nodes
class IndexTermVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    // label, Title
    // Handle children
    for (let child of node.children) {
      if (!this.isVisited(child)) {
        if (this.parentNode) {
          this.parentNode.searchTerms.push(index_term(child));
        }
        child.setBitmarkProperties(node);
        this.markVisited(child); // Set child as visited
      }
    }
  }
}
// <notes specific-use="revision-desc">
class NotesTypeRevisionDescVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    // loop over n <p> in <notes>

    let content = "";
    let notFirst = false;
    for (const paragraphItem of node.children) {
      if (paragraphItem.name === "p") {
        content += notFirst ? "\n" : "";
        notFirst = true;
        // revision-meta
        // revision-info
        // content-type="revision-meta"
        const revisionMeta = findNodeRecursively(
          paragraphItem,
          "named-content",
          "content-type",
          "revision-meta"
        );
        if (revisionMeta) {
          this.markVisited(revisionMeta);
          var pseudoPNode = revisionMeta.clone();
          pseudoPNode.name = "p";
          content = content + processParagraph(pseudoPNode, this);
          const revisionInfo = findNodeRecursively(
            paragraphItem,
            "named-content",
            "content-type",
            "revision-info"
          );
          if (revisionInfo) {
            this.markVisited(revisionInfo);
            var pseudoPNode = revisionInfo.clone();
            pseudoPNode.name = "p";
            content = content + ": " + processParagraph(pseudoPNode, this);
          }
        }
        paragraphItem.isNormative = true;
        paragraphItem.isRemark = false;
        paragraphItem.customerId = paragraphItem.customerId
          ? paragraphItem.customerId
          : paragraphItem.parentId + "-" + paragraphItem.children.length;
      }
      this.markVisited(paragraphItem);
    }

    if (content.length > 0) {
      this.writeToFile(
        bmTemplates.info(
          "",
          "",
          content,
          getAnchorAndCustomerId(node, this),
          ""
        )
      );
    }
    // Handle children
    for (let child of node.children) {
      child.setBitmarkProperties(node);
      this.markVisited(child); // Set child as visited
    }
  }
}

class ListVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    const listText = processList(node, this, 1, currentPath);
    if (listText != null) {
      writeArticleOrNote(node, listText, this);
    }

    // Handle children
    for (let child of node.children) {
      child.setBitmarkProperties(node);
      this.markVisited(child); // Set child as visited
    }
  }
}

// SecTypeParagraph has item & lead. is output at the first paragraph
class SecTypeParagraph extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;



    node.isContainer = this.isContainer;
    node.isNormative = true;
    const labelNode = findFirstChild(node, "label");
    const titleNode = findFirstChild(node, "title");
    var label = labelNode ? labelNode.plaintext : "";
    //var title = titleNode ? titleNode.plaintext : "";
    this.markVisited(labelNode);
    var title = "";
    if (titleNode) {
      processIndexTerms(node, titleNode, this);
      title = processParagraph(titleNode, this);
      this.markVisited(titleNode);
    }

    // It may be that TitleNode also contains index terms
    processIndexTerms(node, labelNode, this);

    // Handle children
    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        child.label = label;
        child.title = title;
        child.searchTerms = node.searchTerms;
        if (label.length > 0) {
          child.overloadAnchorId = node.anchorId;
          child.overloadCustomerId = node.customerId;
        }
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
        label = child.label;
        title = child.title;
      }
    }
  }
}

/*
label
caption
legend
fig
*/
class FigGroupVisitor extends IVisitor {
  visit(node, visitpath) {
    if (!this.markVisited(node)) {
      return;
    }

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    const labelNode = findFirstChild(node, "label");
    this.markVisited(labelNode);
    const label = labelNode ? labelNode.plaintext : "";
    const captionNode = findFirstChild(node, "caption");
    this.markVisited(captionNode);

    //const captionTitleNode = findFirstChild(captionNode, "title");
    //const title = processParagraph(captionTitleNode, this);
    //const title = captionTitleNode ? captionTitleNode.plaintext : "";
    //this.markVisited(captionTitleNode);

    /* 
    // check if needed
    if (captionNode ) {
      // see TableWrapVisitor() --> processCaptionParagraphs()
    }
    */

    // Handle children
    // expecting <legend>, <fig>
    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
      }
    }
  }
}

// Concrete Visitor for "fig" nodes
class FigVisitor extends IVisitor {
  visit(node, visitpath) {
    if (!this.markVisited(node)) {
      return;
    }

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;

    // label, caption, graphic,lengend
    //const fig_id = node.attributes["id"].replace("-", "_");
    const fig_size = node.attributes["specific-use"];
    const labelNode = findFirstChild(node, "label");
    this.markVisited(labelNode);
    const label = labelNode ? labelNode.plaintext : "";
    const captionNode = findFirstChild(node, "caption");
    this.markVisited(captionNode);
    const captionTitleNode = findFirstChild(captionNode, "title");
    this.markVisited(captionTitleNode);
    processIndexTerms(node, captionTitleNode, this);
    //const legendNode = findFirstChild(node, "legend");
    //this.markVisited(legendNode);
    //const legenTitle = findFirstChild(legendNode, "title");

    var title = "";
    if (captionTitleNode) {
      title = processParagraph(captionTitleNode, this);
    }
    //const title = captionTitleNode ? captionTitleNode.plaintext : "";
    const graphicNode = findFirstChild(node, "graphic");
    this.markVisited(graphicNode);

    // check if graphicNode is missing or if there are multiple graphicNodes
    if (!graphicNode) {
      CONFIG.logger.warn(TransformerLogger.CATEGORY.XML_STRUCTURE, "FigureNoGraphic", "id: " + node.customerId);
    }
    else {
      let cnt = 0;
      for (let child of node.children) {
        cnt += child.name === "graphic" ? 1 : 0;
        if (cnt > 1) {
          CONFIG.logger.warn(TransformerLogger.CATEGORY.XML_STRUCTURE, "FigureToManyGraphics", "id: " + node.customerId);
        }
      }
    }

    const legendNode = findFirstChild(node, "legend");
    this.markVisited(legendNode);

    let legendtxt = null;
    if (legendNode) {
      const defListNode = findFirstChild(legendNode, "def-list");
      this.markVisited(defListNode);
      if (defListNode) {
        legendtxt = processDefList(defListNode, this);
      }
    }

    // fig with graphic is okay
    if (
      graphicNode &&
      graphicNode.attributes &&
      graphicNode.attributes["xlink:href"]
    ) {
      // create and upload image
      const graphicPath =
        CONFIG.localRessourcePath + "/" + graphicNode.attributes["xlink:href"];

      const ressourceFileName = path.basename(
        graphicNode.attributes["xlink:href"].replace("/", "_")
      );
      const url = CONFIG.ressourceBaseUrl + ressourceFileName;
      Utils.publishImage(graphicPath, ressourceFileName);
      const size = getFigSize(fig_size);
      writeImageFigure(
        node,
        label,
        title,
        legendtxt,
        url,
        size[0],
        size[1],
        this
      );
    }

    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
      }
    }
  }
}

class NotesGroupVisitor extends IVisitor {
  visit(node, visitpath) {
    if (!this.markVisited(node)) {
      return;
    }

    const id = node.attributes["id"];
    const labelNode = findFirstChild(node, "title");
    // It may be that TitleNode also contains index terms
    // these should also be saved in the parent node
    processIndexTerms(node, labelNode, this);
    var label = labelNode ? labelNode.plaintext : "";
    this.markVisited(labelNode);
    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;

    // loop through non-normative-note
    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        child.label = label;
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
        label = child.label;
      }
    }
  }
}
/*
boxed-text
non-normative-note
non-normative-example
ref-list
table-wrap
fig
graphic
list
*/
class BoxedTextVisitor extends IVisitor {
  visit(node, visitpath) {
    if (!this.markVisited(node)) {
      return;
    }
    node.isBoxedtext = true;

    const labelNode = findFirstChild(node, "title");
    let label = labelNode ? labelNode.plaintext : "";
    if (label.length > 0) {
      label = node.label.length > 0 ? node.label + "/" + label : label; //
    } else {
      label = node.label; // overload from parent
    }
    this.markVisited(labelNode);
    // It may be that TitleNode also contains index terms
    // these should also be saved in the parent node
    processIndexTerms(node, labelNode, this);

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    // loop through non-normative-note
    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        child.label = label;
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
        label = child.label;
      }
    }
    node.isBoxedtext = false;
  }
}
// NotesTypeRevisionDesc

// Concrete Visitor for "non-normative-note" nodes
class NonNormativeNoteVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;


    const contenttype = node.attributes["content-type"]
      ? node.attributes["content-type"]
      : "";

    node.isNormative = false;
    node.isRemark = contenttype === "annotation";

    // Handle children
    for (let child of node.children) {
      if (!this.isVisited(child)) {
        child.setBitmarkProperties(node);
        child.label = node.label;
        const visitor = getVisitorForNode(
          child,
          this.visitedNodes,
          this.transformer,
          node
        );
        child.accept(visitor, currentPath);
        node.label = child.label;
      }
    }
    node.isNormative = true;
    node.isRemark = false;
  }
}

function checkIfComplexStructure(node) {
  return [
    "notes-group",
    "fig",
    "table-wrap",
    "boxed-text",
    "inline-formula",
    "disp-formula",
  ].some((tag) => findNodeRecursively(node, tag));
}

// Concrete Visitor for "std-meta" nodes
// used for SNG 491000
class StdMetaVisitor extends IVisitor {
  visit(node, visitpath) {
    if (!this.markVisited(node)) {
      return;
    }

    node.isContainer = this.isContainer;
    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;

    this.markVisited(node);

    var titleWrapNode = findNodeRecursively(
      node,
      "title-wrap",
      "xml:lang",
      this.transformer.lang
    );
    if (!titleWrapNode) {
      // fallback to default language
      titleWrapNode = findNodeRecursively(node, "title-wrap", "xml:lang", "de");
    }
    if (titleWrapNode) {
      //titleWrapNode.id = titleWrapNode.parentId; // reuse parentId because title-wrap as no id
      //titleWrapNode.customerId = titleWrapNode.parentId;
      this.markVisited(titleWrapNode);
      var titleNode = findNodeRecursively(node, "main");
      var title = titleNode ? titleNode.plaintext : "";
      var chapterLabel = "";
      var infoTxt = "";
      const stdRefNode = findFirstChild(node, "std_ref_dated");
      const stdXrefSupersedesNode = findFirstChild(node, "std_xref_supersedes");

      if (!stdXrefSupersedesNode) {

      }

      if (stdRefNode) {
        let stdXreTxt = null;
        if (stdXrefSupersedesNode) {
          // if std_xref_supersedes exists, then read std-ref
          this.markVisited(stdXrefSupersedesNode);
          const supersedesStdRefNode = findFirstChild(
            stdXrefSupersedesNode,
            "std-ref"
          );
          stdXreTxt = supersedesStdRefNode
            ? supersedesStdRefNode.plaintext
            : null;
        }
        const docRefTxt = stdRefNode.plaintext;

        infoTxt =
          docRefTxt +
          (stdXreTxt
            ? "\n" + replace_txt_map[CONFIG.lang] + ": " + stdXreTxt
            : "");
        const lastSpaceIndex = docRefTxt.lastIndexOf(" "); // cut before lang 'de' 'fr' it
        chapterLabel = docRefTxt;
        if (
          (docRefTxt && docRefTxt.substring(lastSpaceIndex) === " de") ||
          " fr" ||
          " it"
        ) {
          chapterLabel = docRefTxt.substring(0, lastSpaceIndex);
        }
      }
      this.writeToFile(
        bmTemplates.chapter(
          node.seclevel,
          chapterLabel,
          title,
          getAnchorAndCustomerId(node, this), // anchorId, customerId comes from parent sub-part see SubPartVisitor
          "",
          CONFIG.lang
        )
      );
      if (infoTxt.length > 0) {
        //stdRefNode.id = stdRefNode.parentId + "_1"; //because this node has no id
        //stdRefNode.customerId = stdRefNode.id;
        this.writeToFile(
          bmTemplates.info(
            "",
            "",
            infoTxt,
            getAnchorAndCustomerId(stdRefNode, this),
            ""
          )
        );
      }
    }
  }
}

// Concrete Visitor for "p" nodes
class ParagraphVisitor extends IVisitor {
  visit(node, visitpath) {
    if (!this.markVisited(node)) {
      return;
    }

    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;

    if (checkIfComplexStructure(node)) {
      // contains notes-group, etc --> split <paragraph>
      do {
        const content = processParagraph(node, this, 1);
        if (content && content.length > 0) {
          writeArticleOrNote(node, content, this);
        }
        if (node.startNode) {
          node.startNode.setBitmarkProperties(node); // check:setBitmarkProperties
          processNode(node.startNode, this, currentPath);
        }
      } while (!this.allChildrenVisited(node));
    } else {
      const content = processParagraph(node, this);
      writeArticleOrNote(node, content, this);
    }

    for (let child of node.children) {
      child.setBitmarkProperties(node);
      this.markVisited(child);
    }
  }
}

class NINNode {
  constructor(ninNode) {
    if (ninNode instanceof NINNode) {
      this.uuid = ninNode.uuid;
      this.name = ninNode.name;
      this.id = ninNode.id;
      this.customerId = ninNode.customerId;
      this.anchorId = ninNode.anchorId;
      this.seclevel = ninNode.seclevel;
      this.parentId = ninNode.parentId;
      this.subpartId = ninNode.subpartId;
      this.docpart = ninNode.docpart;
      this.parentNodeName = ninNode.parentNodeName;
      this.plaintext = ninNode.plaintext;
      this.attributes = { ...ninNode.attributes }; // Deep copy for objects
      this.children = [];
      this.label = ninNode.label;
      this.title = ninNode.title;
      this.isRemark = ninNode.isRemark;
      this.isBoxedtext = ninNode.isBoxedtext;
      this.isNormative = ninNode.isNormative;
      this.startNode = ninNode.startNode;
      this.searchTerms = [...ninNode.searchTerms]; // Deep copy for arrays
      this.path = ninNode.path;

      for (let child of ninNode.children) {
        this.children.push(new NINNode(child));
      }
    } else {
      this.uuid = ninNode.uuid;
      this.name = ninNode.name;
      this.id = ninNode.id;
      this.customerId = ninNode.customerId;
      this.anchorId = ninNode.anchorId;
      this.seclevel = ninNode.seclevel;
      this.parentId = ninNode.parentId;
      this.subpartId = ninNode.subpartId;
      this.docpart = ninNode.docpart;
      this.parentNodeName = ninNode.parentNodeName;
      this.plaintext = ninNode.plaintext;
      this.attributes = ninNode.attributes;
      this.children = [];
      this.label = null;
      this.title = null;
      this.isRemark = false;
      this.isBoxedtext = false;
      this.isNormative = true;
      this.startNode = null;
      this.searchTerms = [];
      this.path = ninNode.path;

      if (ninNode.children) {
        for (let child of ninNode.children) {
          this.children.push(new NINNode(child));
        }
      }
    }
  }
  accept(visitor, visitpath = "") {
    visitor.visit(this, visitpath);
  }
  // Set the container node if it is not already set
  setBitmarkProperties(node) {
    this.isBoxedtext = node.isBoxedtext;
    this.isNormative = node.isNormative;
    this.isRemark = node.isRemark;
  }
  getSearchTerms() {
    if (this.searchTerms) {
      if (this.searchTerms) {
        const modifiedSearchTerms = this.searchTerms.map((term) =>
          term.replace(/['",]/g, "")
        );
        return modifiedSearchTerms.join(",");
      }
      return this.searchTerms.join(",");
    }
    return "";
  }
  clone() {
    return new NINNode(this);
  }
}
class TableWrapVisitor extends IVisitor {
  visit(node, visitpath) {
    // Skip the node if it has already been visited
    if (!this.markVisited(node)) {
      return;
    }
    if (!node.attributes || !node.attributes["id"]) {

    }
    node.isContainer = this.isContainer;
    const table_id = node.attributes["id"]
      ? node.attributes["id"].replace("-", "_")
      : node.customerId.replace("-", "_");
    const labelNode = findFirstChild(node, "label");
    let label = labelNode ? labelNode.plaintext : "";
    // create pseudo node and process content as paragraph
    if (labelNode) {
      const pseudoPNode = labelNode.clone();
      pseudoPNode.name = "p";
      label = processParagraph(pseudoPNode, this);
    }

    this.markVisited(labelNode);
    const captionNode = findFirstChild(node, "caption");

    this.markVisited(captionNode);
    const captionTitleNode = findFirstChild(captionNode, "title");
    let captionTitle = captionTitleNode ? captionTitleNode.plaintext : "";
    if (captionTitleNode) {
      const pseudoPNode = captionTitleNode.clone();
      pseudoPNode.name = "p";
      captionTitle = processParagraph(pseudoPNode, this);
    }
    // It may be that TitleNode also contains index terms
    // these should also be saved in the parent node
    processIndexTerms(node, captionTitleNode, this);
    this.markVisited(captionTitleNode);
    const tableNode = findFirstChild(node, "table");
    this.markVisited(tableNode);
    const tableFootNode = findFirstChild(node, "table-wrap-foot");
    this.markVisited(tableFootNode);

    if (captionNode && findFirstChild(captionNode, "p")) {
      // more complex caption ...
      // process captionNode if it contains additional <p>
      // insert additional bit with label and title before fig
      captionNode.setBitmarkProperties(node);
      captionNode.label = labelNode ? label : "";
      captionNode.title = captionTitleNode ? captionTitle : "";
      processCaptionParagraphs(captionNode, this); // process caption paragraphs
      label = "";
      captionTitle = "";
    }

    var htmlByRef = {
      html: "",
      list_type: "",
      list_style_detail: "",
      tablePart: "",
      rawTxt: "",
      footerNodes: [],
    };
    makeTableHTML(tableNode, htmlByRef);
    const ts = Date.now();
    const htmlFilePath = (table_id ? table_id : uuidv4()) + "_" + ts;

    this.transformer.htmlTable2PNG.createFile(htmlByRef.html, htmlFilePath); // create File

    writeTable(
      node,
      labelNode ? label : "",
      captionTitleNode ? captionTitle : "",
      !node.isRemark ? htmlByRef.rawTxt : "", // todo: pass rawtext also for remark
      CONFIG.ressourceBaseUrl + htmlFilePath + ".png",
      this
    );
    const currentPath = visitpath ? `${visitpath} > ${node.name}` : node.name;

    //
    for (let child of node.children) {
      for (let child of node.children) {
        if (!this.isVisited(child)) {
          child.setBitmarkProperties(node);
          const visitor = getVisitorForNode(
            child,
            this.visitedNodes,
            this.transformer,
            node
          );
          child.accept(visitor, currentPath);
        }
      }
    }
  }
}

function makeTableHTML(node, htmlByRef) {
  const nodeTags = createHtmlNodeTags(node, htmlByRef);
  // todo: <td> inline-graphic
  if (
    node.name != "inline-graphic" &&
    node.name != "disp-formula" &&
    node.name != "inline-formula" &&
    node.name != "disp-formula-group"
  ) {
    // inline-graphic & disp-formula are skipped, not used in HTML
    htmlByRef.html = htmlByRef.html.concat(nodeTags.openTag);
  }

  if (node.name === "disp-formula" || node.name === "inline-formula") {
    // extract MathML and convert to HTML
    const data = extractMathML(node);
    htmlByRef.html = htmlByRef.html.concat(data);
    node.children = [];
  } else if (node.name === "graphic") {
    const href = CONFIG.localRessourcePath + node.attributes["xlink:href"];
    htmlByRef.html = htmlByRef.html.concat(`<img src="${href}"></img>`);
  } else if (node.name === "fn" && htmlByRef.tablePart === "tfoot") {
    // insert td with colspan 100 for tfoot
    htmlByRef.html = htmlByRef.html.concat("<td colspan='100'>");
  } else if (node.name === "fn" && htmlByRef.tablePart !== "tfoot") {
    // it is a footnote, do not process it here
    htmlByRef.footerNodes.push(node);
    return;
  } else if (node.name === "inline-graphic") {
    // extract graphic and convert to HTML
    const href = CONFIG.localRessourcePath + node.attributes["xlink:href"];
    htmlByRef.html = htmlByRef.html.concat(`<img src="${href}"></img>`);
  }

  if (node.children && node.children.length > 0) {
    // loop through children
    for (const child of node.children) {
      if (child.name === "textfragment") {
        if (nodeTags.openTag === "<b>" || nodeTags.openTag === "<i>") {
          htmlByRef.html = htmlByRef.html.concat(" " + child.plaintext + " ");
        } else {
          htmlByRef.html = htmlByRef.html.concat(child.plaintext);
        }
        htmlByRef.rawTxt = htmlByRef.rawTxt.concat("\n" + child.plaintext);
      } else if (nodeTags.openTag === "<li>" && child.name === "label") {
        // label in list-item
        htmlByRef.html = htmlByRef.html.concat(child.plaintext + " ");
      } else if (child.name === "private-char") {
        // in case of private-char, extract graphic and convert to HTML dont use font
        // handle like normal inline-graphic with fixed w/h size
        const [isKnown, symbol, altTxt, filename, width, height] =
          private_char_filePath(child);
        const scaled_width = Math.round(width);
        const scaled_height = Math.round(height);
        htmlByRef.html = htmlByRef.html.concat(
          `<span class="img-container"
          ><img style="width: ${scaled_width}px; height: ${scaled_height}px;" src="${filename}"></img></span>`
        ); // insert img tag
      } else if (child.name === "fn" && htmlByRef.tablePart !== "tfoot") {
        // it is a footnote, do not process it here
        htmlByRef.footerNodes.push(child);
      } else {
        // recursive call
        makeTableHTML(child, htmlByRef);
      }
    }
    if (node.name === "fn" && htmlByRef.tablePart === "tfoot") {
      htmlByRef.html = htmlByRef.html.concat("</td>"); // close td in tfoot
    }
    if (nodeTags.closeTag === "</table>" && htmlByRef.footerNodes.length > 0) {
      // add tfoot if there are footer nodes
      if (htmlByRef.tablePart === "tbody") {
        htmlByRef.html = htmlByRef.html.concat("<tfoot>");
      }
      for (const footerNode of htmlByRef.footerNodes) {
        htmlByRef.html = htmlByRef.html.concat("<tr><td colspan='100'>");
        for (const child of footerNode.children) {
          makeTableHTML(child, htmlByRef);
        }
        htmlByRef.html = htmlByRef.html.concat("</td></tr>");
      }
      if (htmlByRef.tablePart === "tbody") {
        htmlByRef.html = htmlByRef.html.concat("</tfoot>");
      }
    }
    htmlByRef.html = htmlByRef.html.concat(nodeTags.closeTag);
  }
}

function extractMathML(disp_formula_node) {
  // extract MathML and convert to HTML
  let mathml = null;

  if (
    disp_formula_node.name === "math" ||
    disp_formula_node.name === "mml:math"
  ) {
    mathml = disp_formula_node;
  } else {
    mathml = findFirstChild(disp_formula_node, "mml:math");
    if (!mathml) {
      mathml = findFirstChild(disp_formula_node, "math");
    }
  }

  const multipleFormuals = findNodeRecursively(mathml, "mml:mtable")
    ? true
    : false;

  if (mathml) {
    const mathmlByRef = { html: "" };
    processMLChildren(mathml, mathmlByRef);
    return new MML2HTML().transform(mathmlByRef.html);
  }
  return ""; // no MathML found
}

function processMLChildren(mathmlNode, mathmlByRef) {
  const nodeTags = createHtmlNodeTags(mathmlNode, mathmlByRef);
  mathmlByRef.html = mathmlByRef.html.concat(nodeTags.openTag);
  if (mathmlNode.children && mathmlNode.children.length > 0) {
    for (const child of mathmlNode.children) {
      // loop through children
      if (child.name === "textfragment") {
        mathmlByRef.html = mathmlByRef.html.concat(child.plaintext);
      } else if (child.name === "mml:mtext" && child.plaintext.length === 0) {
        // mtext is empty, skip it
      } else {
        processMLChildren(child, mathmlByRef);
      }
    }
    // close the tag
    mathmlByRef.html = mathmlByRef.html.concat(nodeTags.closeTag);
  }
}

function createHtmlNodeTags(node, htmlByRef) {
  var htmlNodeName = node.name;
  var style = "";
  if (node.name === "list") {
    // loop through ListItems
    htmlByRef.list_type = node.attributes["list-type"];
    htmlByRef.list_style_detail = node.attributes["style-detail"]
      ? node.attributes["style-detail"]
      : "";
    htmlNodeName = "ul";
    node.attributes = {};
    if (htmlByRef.list_type === "bullet") {
      htmlNodeName = "ul";
    } else if (htmlByRef.list_type === "ordered") {
      htmlNodeName = "ol";
    }
    const labelNode = findNodeRecursively(node, "label");
    if (labelNode && labelNode.parentNodeName === "list-item") {
      // if list/list-items has labels, then use list-style-type
      htmlNodeName = "ul";
      style = "list-style-type: none;";
    }
  } else if (node.name === "list-item") {
    htmlNodeName = "li";
  } else if (node.name === "list-item-p") {
    // list-item-p corresponds to p
    htmlNodeName = "p";
  } else if (node.name === "italic") {
    // italic corresponds to i
    htmlNodeName = "i";
  } else if (node.name === "bold") {
    // bold corresponds to b
    htmlNodeName = "b";
  } else if (node.name === "table-wrap-foot") {
    // table-wrap-foot corresponds to tfoot
    htmlNodeName = "tfoot";
  } else if (node.name === "break") {
    // break corresponds to br
    htmlNodeName = "br";
  } else if (node.name === "fn") {
    // fn footnote corresponds to tr
    htmlNodeName = "tr";
  } else if (node.name === "xref") {
    htmlNodeName = ""; // xref is not used in HTML --> <ignore> tag is ignored by puppeteer html interpreter
  } else if (node.name === "label") {
    htmlNodeName = ""; // ignore label in HTML
  }

  if (node.name == "thead") {
    htmlByRef.tablePart = "thead";
  } else if (node.name == "tbody") {
    htmlByRef.tablePart = "tbody";
  } else if (node.name == "table-wrap-foot") {
    htmlByRef.tablePart = "tfoot";
  }

  if (htmlNodeName.length > 0) {
    return {
      openTag: "<"
        .concat(htmlNodeName)
        .concat(style && style.length > 0 ? ` style="${style}" ` : "")
        .concat(attributesAsHTML(node.attributes))
        .concat(node.children && node.children.length > 0 ? ">" : "/>"),
      closeTag:
        node.children && node.children.length > 0
          ? "</" + htmlNodeName + ">"
          : "",
    };
  }
  return {
    openTag: "",
    closeTag: "",
  };
}

function attributesAsHTML(attributes) {
  var html = "";
  for (const key in attributes) {
    // add attributes
    if (attributes.hasOwnProperty(key)) {
      html = html
        .concat(" ")
        .concat(key)
        .concat("='")
        .concat(attributes[key])
        .concat("'"); // add attributes
    }
  }
  return html;
}

class BitmarkTransformer {
  constructor() {
    this.outputPath = "";
    this.ressourcePath = "";
    this.otStream = null;
    this.lang = "de";
    this.customerId2AnchorMapper = null;
    this.htmlTable2PNG = null;
  }
  // Main transform function
  transform(jsonFile, lang, ressourcePathP, outputPath, mapperPath, bookRegistryPath, onProgress, logger) {
    return new Promise((resolve, reject) => {
      CONFIG.logger = logger;
      CONFIG.localRessourcePath = ressourcePathP.endsWith("/")
        ? ressourcePathP
        : ressourcePathP + "/";
      this.outputPath = outputPath;
      this.lang = lang;
      CONFIG.lang = lang;
      CONFIG.onProgress = onProgress;

      // Initialize HtmlTable2PNG with session-specific path
      // Change: Use workDir instead of json dir for images as per requirement
      // work/<sessionid>/<normid>/images
      const workDir = path.dirname(outputPath);

      CONFIG.onProgress('convert_to_bitmark', 0, null);
      this.customerId2AnchorMapper = new MappingStore(mapperPath); // Initialize CustomerId2AnchorMapper  
      // Initialize Mapper
      this.docIdMapper = new XpublisherDocId2GmbDocMapper(mapperPath, bookRegistryPath);
      this.docIdMapper.loadOverAllMappings();

      // load specific mapping for this document
      this.docIdMapper.loadXPSDocId2GmbIdMapping(CONFIG.localRessourcePath);

      // Remove the output file if it exists
      if (fs.existsSync(this.outputPath)) {
        fs.unlinkSync(this.outputPath);
      }

      // New image path: work/<sessionid>/<normid>/images
      const imagesDir = path.join(workDir, "images");
      if (fs.existsSync(imagesDir)) {
        fs.rmSync(imagesDir, { recursive: true, force: true });
      }
      fs.mkdirSync(imagesDir, { recursive: true });

      this.htmlTable2PNG = new HtmlTable2PNG();
      // Pass workDir as the base (upload_file_list.txt will be there) and 'images' as the subfolder
      this.htmlTable2PNG.init(workDir, 'images');

      this.otStream = fs.createWriteStream(this.outputPath);
      var initBookF = true;
      let parentNode = null;

      const totalBytes = fs.statSync(jsonFile).size;
      let bytesRead = 0;
      let lastPercent = 0;

      const readStream = fs.createReadStream(jsonFile, "utf8");

      readStream.on("data", (chunk) => {
        bytesRead += chunk.length; // Approximate for utf8
        if (totalBytes > 0 && onProgress) {
          const percent = Math.min(100, Math.round((bytesRead / totalBytes) * 100));
          if (percent > lastPercent + 2) { // Update every 2%
            lastPercent = percent;
            onProgress('convert_to_bitmark', percent, null);
          }
        }
      });

      readStream
        .pipe(JSONStream.parse("standard.*")) // Parse each Object in "standard"
        .on("data", (nodeData) => {
          let currentNode = this.parseJSONToTree(nodeData);
          if (initBookF) {
            this.writeToFile(initBook(currentNode, this.lang));
            initBookF = false;
          }
          // Create a global visitedNodes set
          const visitedNodes = new Set();
          if (currentNode.name !== "front") {
            const visitor = getVisitorForNode(
              currentNode,
              visitedNodes,
              this,
              parentNode
            );
            currentNode.accept(visitor);
            parentNode = currentNode;
          }
        })
        .on("error", (err) => {

          reject(err);
        })
        .on("end", () => {

          onProgress('convert_to_bitmark', 100, null);
          // create and upload png files
          this.htmlTable2PNG
            .processFileListSynchronously(onProgress)
            .then(() => {

              // Close the stream and resolve the promise only when everything is finished
              this.otStream.end(() => {
                resolve();
              });
            })
            .catch((error) => {

              reject(error);
            });
        });
    });
  }

  getGmbDocId(xpDocId) {
    return this.docIdMapper.getGmbDocId(xpDocId);
  }
  getAnchorForCustId(customerIdOrHref) {
    const entry =
      this.customerId2AnchorMapper.getByCustomerId(customerIdOrHref);
    return entry ? entry.anchorId : null;
  }

  getParentAnchorForCustId(customerIdOrHref) {
    const entry =
      this.customerId2AnchorMapper.getByCustomerId(customerIdOrHref);
    return entry && entry.hasOwnProperty("parentAnchorId")
      ? entry.parentAnchorId
      : null;
  }

  docIdExistsInSpecificMapping(docId) {
    return this.docIdMapper.docIdExistsInSpecificMapping(docId);
  }

  parseJSONToTree(jsonData) {
    const node = new NINNode(jsonData);
    return new NINNode(jsonData);
  }

  writeToFile(data) {
    this.otStream.write(data);
  }
}

// Export the BitmarkTransformer class as a module
module.exports = BitmarkTransformer;
// Export additional functions
module.exports.findNodeById = findNodeById;

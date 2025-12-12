"use strict";
/*
[%.1 item][%.2 lead]  - lead muss direkt nach item kommen, 
[!instruction]
*/

const { ExtensionTransport } = require("puppeteer");

const normativmap = {
  de: "[@tag:normativ]",
  fr: "[@tag:normatif]",
  it: "[@tag:normativo]",
};

const non_normativmap = {
  de: "[@tag:non-normativ]",
  fr: "[@tag:non-normatif]",
  it: "[@tag:non-normativo]",
};

const bundemap = {
  de: "[@tag:B+E]",
  fr: "[@tag:E+C]",
  it: "[@tag:E+S]",
};

//const tInternal_link = "[.internal-link][►£{anchor}]£{label}";
const tExtetnal_link = "== £{linkTxt} ==|link:£{link}|";

const tAnchor = "[▼£{anchor}]";
const tCustomerid = "[@customerId:£{customerid}]";
const tBook = "\n[.book:book]\n[#£{title}]\n[##£{subtitle}]\n";
const tChapter =
  "\n[.chapter]\n£{anchor}\n£{customerid}£{search}\n[£{levelStr}£{text}]\n[%£{label}]\n";
const tTableCaption = "@caption:£{caption}|";
const tLabel = "\n[%£{item}]£{lead}"; // 1. item, 2. lead --> [%item-here] [%.1 lead-here]
const tSearch = "\n[@search:£{search}]"; // search tag
const tInstruction = "\n[!£{instruction}]";
const tSidenoteTable =
  "\n[.side-note&image]\n£{anchor}\n£{customerid}£{itemlead}\n[&image:£{url}]\n£{body}";

const tInfoTable =
  "\n[.info&image]\n£{anchor}\n£{customerid}£{itemlead}\n[&image:£{url}]\n£{body}";
const tExampleTable =
  "\n[.example&image]\n£{anchor}\n£{customerid}£{itemlead}\n[&image:£{url}]\n£{body}";

const tImage =
  "\n[.image][&image:£{url}][@width:£{width}][@caption:£{caption}]\n";
const tListbullet = "\n£{levelStr}• £{text}";
const tListAlphaUpper = "\n£{levelStr}•A £{text}";
const tListAlphaLower = "\n£{levelStr}•a £{text}";
const tListNumbered = "\n£{levelStr}•£{startNo} £{text}";
const tListSimple = "\n£{levelStr}•_ £{text}";
const tListRomanUpper = "\n£{levelStr}•£{startNo}I £{text}";
const tListRomanLower = "\n£{levelStr}•£{startNo}i £{text}";

//const tDetails_1 = "\n[.details-1:bitmark++]\n[%£{label}]\n£{text}\n";

const tstandard_note_non_normative =
  "\n\n[.standard-note-non-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{search}£{itemlead}£{instruction}\n£{text}";

const tstandard_note_normative =
  "\n\n[.standard-note-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{search}£{itemlead}£{instruction}\n£{text}";

const tstandard_article_normative =
  "\n\n[.standard-article-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{search}£{itemlead}£{instruction}\n£{text}";
const tstandard_article_non_normative =
  "\n\n[.standard-article-non-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{search}£{itemlead}£{instruction}\n£{text}";

const tstandard_image_figure_normative =
  // "\n\n[.standard-image-figure-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n[&image:£{url}][@width:£{width}]\n£{legend}";
  "\n\n[.smart-standard-image-figure-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n[&image:£{url}][@width:£{width}]\n£{legend}";

/*
[.standard-image-figure-non-normative:bitmark++]
[@id:1137643]
[▼fig_3.1.2Figur34_SN4110002025de]
[%3.1.2 Figur 34:]
[!System TN-C-S (DC)]
[&image:https://carulab.io:63108/uploads/COO.6505.1000.12.3464237_content.svg][@width:384]
*/
const tstandard_image_figure_non_normative =
  //"\n\n[.standard-image-figure-non-normative:bitmark++]\n£{tag}\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n[&image:£{url}][@width:£{width}]\n£{legend}";
  "\n\n[.smart-standard-image-figure-non-normative:bitmark++]\n£{tag}\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n[&image:£{url}][@width:£{width}]\n£{legend}";

const tstandard_example_normative =
  "\n\n[.standard-example-normative:bitmark++&image]\n£{anchor}\n£{tag}\n£{customerid}£{itemlead}£{instruction}\n|image:£{url}|@width:£{width}|£{legend}";

const tstandard_example_non_normative =
  "\n\n[.standard-example-non-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n|image:£{url}|@width:£{width}|£{legend}";

const tstandard_table_image_normative =
  "\n\n[.standard-table-image-normative:bitmark++]\n£{tag}\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n[&image:£{url}]\n£{body}";

const tstandard_table_image_non_normative =
  "\n\n[.standard-table-image-non-normative:bitmark++]\n£{tag}\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n[&image:£{url}]\n£{body}";

const tstandard_table_remark_normative =
  "\n\n[.standard-remark-table-image-normative:bitmark++]\n£{tag}\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n[&image:£{url}]\n£{body}";

const tstandard_table_remark_non_normative =
  "\n\n[.standard-remark-table-image-non-normative:bitmark++]\n£{tag}\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n[&image:£{url}]\n£{body}";

const tFigure_remark =
  "\n\n[.standard-remark-non-normative:bitmark++&image]\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n|image:£{url}|@width:£{width}|£{legend}";

const tstandard_remark_non_normative =
  "\n\n[.standard-remark-non-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{search}£{itemlead}£{instruction}\n£{text}";

const tstandard_remark_normative =
  "\n\n[.standard-remark-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{search}£{itemlead}£{instruction}\n£{text}";

const tstandard_formula_non_normative =
  "\n\n[.smart-standard-formula-non-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{search}£{itemlead}£{instruction}\n£{text}";

const tstandard_formula_normative =
  "\n\n[.smart-standard-formula-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{search}£{itemlead}£{instruction}\n£{text}";

const tstandard_legend_non_normative =
  "\n\n[.smart-standard-legend-non-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{search}£{itemlead}£{instruction}\n£{text}";

const tstandard_legend_normative =
  "\n\n[.smart-standard-legend-normative:bitmark++&image]\n£{tag}\n£{anchor}\n£{customerid}£{search}£{itemlead}£{instruction}\n£{text}";

const tRemarkTable =
  "\n\n[.remark:bitmark++]\n£{anchor}\n£{customerid}£{itemlead}\n[&image:£{url}]\n£{body}";
//"\n[.standard-remark-non-normative]£{anchor}£{itemlead}\n[&image:£{url}]\n£{body}";

const tArticle =
  "\n\n[.article&image:bitmark++]\n£{anchor}\n£{customerid}£{search}£{itemlead}\n£{text}";

const tInfo =
  "\n\n[.info:bitmark++]\n£{anchor}\n£{customerid}£{search}£{itemlead}\n£{text}";
const tExample =
  "\n\n[.example:bitmark++&image]\n£{anchor}\n£{customerid}£{search}£{itemlead}\n£{text}";
const tSide_note =
  "\n\n[.side-note:bitmark++&image]£{anchor}\n£{customerid}£{search}£{itemlead}\n£{text}";
const tNote =
  "\n\n[.note:bitmark++&image]\n£{anchor}\n£{customerid}£{search}£{itemlead}\n£{text}";

//const tfigure =
//  "\n[.figure:bitmark++]\n£{anchor}£{itemlead}\n[&image:£{url}]£{legend}";
const tFigure =
  "\n\n[.figure:bitmark++]\n£{anchor}\n£{customerid}\n£{itemlead}£{instruction}\n|image:£{url}|@width:£{width}|£{legend}";

const tFigure_example =
  "\n\n[.example:bitmark++]\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n|image:£{url}|@width:£{width}|£{legend}";
const tFigure_side_note =
  "\n\n[.side-note:bitmark++]\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n|image:£{url}|@width:£{width}|£{legend}";
const tFigure_info =
  "\n\n[.info:bitmark++]\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n|image:£{url}|@width:£{width}|£{legend}";
const tFigure_note =
  "\n\n[.note:bitmark++]\n£{anchor}\n£{customerid}£{itemlead}£{instruction}\n|image:£{url}|@width:£{width}|£{legend}";

const TAB = "\t";
const SPACE = " ";
const tImage_inline = "\n|image:£{url}|@width:£{width}|\n";

/**
 * Masks the closing brackets in the given text by replacing them with "^]"
 *
 * @param {string} text - The text where closing brackets should be masked
 * @returns {string} - The text with masked closing brackets
 */
function maskClosingBrackets(text) {
  if (!text || typeof text !== "string") {
    return text;
  }

  // Replace unmasked closing brackets (not preceded by ^) with ^]
  return text.replace(/([^\^]|^)\]/g, function (match, p1) {
    return p1 + "^]";
  });
}

function chapter(level, label, text, anchor = "", searchCSV, lang = "de") {
  const levelstr = "#".repeat(level);
  return addAnchorAndCustomerIdAndTags(tChapter, anchor, lang)
    .replace("£{label}", maskClosingBrackets(label))
    .replace("£{text}", maskClosingBrackets(text))
    .replace("£{search}", searchtag(searchCSV))
    .replace("£{levelStr}", levelstr);
}

function externalLink(linkText, link = "") {
  return tExtetnal_link
    .replace("£{linkTxt}", linkText)
    .replace("£{link}", link);
}

function imageInline(url, width, height) {
  return tImage_inline
    .replace("£{url}", url)
    .replace("£{width}", width)
    .replace("£{height}", height);
}

function book(title, subtitle = "") {
  return tBook.replace("£{title}", title).replace("£{subtitle}", subtitle);
}

function article(
  label = "", // item
  title = "", // lead
  text = "",
  anchor = "",
  searchCSV = ""
) {
  articleTxt(label, title, text, anchor, searchCSV, tArticle);
}

function imageDirective(bit) {
  // If bit not contains [&image:
  // replace ++&image] with ++] and return
  if (!bit || typeof bit !== "string") {
    return bit;
  }
  //if (!bit.includes("[&image:")) {
  if (!bit.includes("[&image:") && !bit.includes("|image:")) {
    return bit.replace("++&image]", "++]");
  }
  return bit;
}

function sideNote(
  label = "", // item
  title = "", // lead
  text = "",
  anchor = "",
  searchCSV = ""
) {
  return articleTxt(label, title, text, anchor, searchCSV, tSide_note);
}

function note(label = "", title = "", text = "", anchor = "", searchCSV = "") {
  return articleTxt(label, title, text, anchor, searchCSV, tNote);
}

function example(
  label = "",
  title = "",
  text = "",
  anchor = "",
  searchCSV = ""
) {
  return articleTxt(label, title, text, anchor, searchCSV, tExample);
}
function info(label = "", title = "", text = "", anchor = "", searchCSV = "") {
  return articleTxt(label, title, text, anchor, searchCSV, tInfo, "");
}
function articleTxt(
  label = "",
  lead = "",
  text = "",
  anchor = "",
  searchCSV = "",
  template = "",
  showLeadAsInstruction = false,
  lang = "de"
) {
  label = !label || label === null ? "" : label;
  lead = !lead || lead === null ? "" : lead;
  text = !text || text === null ? "" : text;
  anchor = !anchor || anchor === null ? "" : anchor;
  searchCSV = !searchCSV || searchCSV === null ? "" : searchCSV;

  return imageDirective(
    addAnchorAndCustomerIdAndTags(template, anchor, lang)
      .replace("£{text}", text)
      .replace(
        "£{itemlead}",
        showLeadAsInstruction
          ? itemLeadTag(label, "")
          : itemLeadTag(label, lead)
      )
      .replace("£{search}", searchtag(searchCSV))
      .replace(
        "£{instruction}",
        showLeadAsInstruction ? instructionTag(lead) : ""
      )
  );
}

function searchtag(searchCSV) {
  return searchCSV && searchCSV.length > 0
    ? tSearch.replace("£{search}", searchCSV)
    : "";
}

function instructionTag(label = "") {
  return label && label.length > 0
    ? tInstruction.replace("£{instruction}", maskClosingBrackets(label))
    : "";
}

function itemLeadTag(item = "", lead = "") {
  item = !item || item === null ? "" : item;
  lead = !lead || lead === null ? "" : lead;

  if (lead.length > 0) {
    lead = "[%" + maskClosingBrackets(lead) + "]"; // add the lead
  }
  return tLabel
    .replace("£{item}", maskClosingBrackets(item))
    .replace("£{lead}", lead);
}

function captionTag(caption = "") {
  return caption && caption.length > 0
    ? tTableCaption.replace("£{caption}", caption)
    : "";
}

function articleTableTxt(
  label = "",
  title = "",
  caption = "",
  rawTxt = "",
  anchor = "",
  url = "",
  template = "",
  lang = "de"
) {
  label = !label || label === null ? "" : label;
  caption = !caption || caption === null ? "" : caption;
  anchor = !anchor || anchor === null ? "" : anchor;
  rawTxt = !rawTxt || rawTxt === null ? "" : rawTxt;
  title = !title || title === null ? "" : title;

  let bm = addAnchorAndCustomerIdAndTags(template, anchor, lang)
    .replace("£{url}", url)
    .replace("£{itemlead}", itemLeadTag(label, ""))
    .replace("£{instruction}", instructionTag(title))
    .replace("£{body}", rawTxt);

  if (caption && caption !== null && caption !== "") {
    bm = bm + captionTag(caption);
  }
  return bm;
}

function addTags(template, lang) {
  if (template.includes("-non-normative:")) {
    template = template.replace("£{tag}", bundemap[lang]);
  } else if (template.includes("-normative:")) {
    template = template.replace("£{tag}", normativmap[lang]);
  } else {
    template = template.replace("£{tag}", "");
  }
  return template;
}

function legend(
  label = "", // item
  title = "", // lead
  text = "",
  anchor = "",
  searchCSV = "",
  non_normative = false,
  showTitleAsInstruction = false,
  lang = "de"
) {
  const template = non_normative
    ? tstandard_legend_non_normative
    : tstandard_legend_normative;
  return articleTxt(
    label,
    title,
    text,
    anchor,
    searchCSV,
    template,
    showTitleAsInstruction,
    lang
  );
}
function formula(
  label = "", // item
  title = "", // lead
  text = "",
  anchor = "",
  searchCSV = "",
  non_normative = false,
  showTitleAsInstruction = false,
  lang = "de"
) {
  const template = non_normative
    ? tstandard_formula_non_normative
    : tstandard_formula_normative;
  return articleTxt(
    label,
    title,
    text,
    anchor,
    searchCSV,
    template,
    showTitleAsInstruction,
    lang
  );
}

function standardRemark(
  label = "", // item
  title = "", // lead
  text = "",
  anchor = "",
  searchCSV = "",
  non_normative = false,
  showTitleAsInstruction = false,
  lang = "de"
) {
  const template = non_normative
    ? tstandard_remark_non_normative
    : tstandard_remark_normative;
  return articleTxt(
    label,
    title,
    text,
    anchor,
    searchCSV,
    template,
    showTitleAsInstruction,
    lang
  );
}

function standardTable(
  label = "",
  title = "",
  caption = "",
  rawTxt = "",
  anchor = "",
  url = "",
  non_normative = false,
  lang = "de"
) {
  const template = non_normative
    ? tstandard_table_image_non_normative
    : tstandard_table_image_normative;
  return articleTableTxt(
    label,
    title,
    caption,
    rawTxt,
    anchor,
    url,
    template,
    lang
  );
}

function sideNoteTable(
  label = "",
  title = "",
  caption = "",
  rawTxt = "",
  anchor = "",
  url = ""
) {
  return articleTableTxt(
    label,
    title,
    caption,
    rawTxt,
    anchor,
    url,
    tSidenoteTable
  );
}

function standardRemarkTable(
  label = "",
  title = "",
  caption = "",
  rawTxt = "",
  anchor = "",
  url = "",
  non_normative = false,
  lang = "de"
) {
  const template = non_normative
    ? tstandard_table_remark_non_normative
    : tstandard_table_remark_normative;
  return articleTableTxt(
    label,
    title,
    caption,
    rawTxt,
    anchor,
    url,
    template,
    lang
  );
}
function exampleTable(
  label = "",
  title = "",
  caption = "",
  rawTxt = "",
  anchor = "",
  url = ""
) {
  return articleTableTxt(
    label,
    title,
    caption,
    rawTxt,
    anchor,
    url,
    tExampleTable
  );
}

function standardImageFigure(
  label = "",
  title = "",
  legend = "",
  url = "",
  width = 1024,
  height = 472,
  anchor = "",
  non_normative = false,
  lang = "de"
) {
  const template = non_normative
    ? tstandard_image_figure_non_normative
    : tstandard_image_figure_normative;
  return figureTxt(
    label,
    title,
    legend,
    url,
    width,
    height,
    anchor,
    template,
    lang
  );
}
function figureRemark(
  label = "",
  title = "",
  legend = "",
  url = "",
  width = 1024,
  height = 472,
  anchor = "",
  lang = "de"
) {
  return figureTxt(
    label,
    title,
    legend,
    url,
    width,
    height,
    anchor,
    tFigure_remark,
    lang
  );
}

function standardArticle(
  label = "", // item
  title = "", // lead
  text = "",
  anchor = "",
  searchCSV = "",
  non_normative = false,
  showTitleAsInstruction = false,
  lang = "de"
) {
  const template = non_normative
    ? tstandard_article_non_normative
    : tstandard_article_normative;
  return articleTxt(
    label,
    title,
    text,
    anchor,
    searchCSV,
    template,
    showTitleAsInstruction,
    lang
  );
}

function standardNote(
  label = "", // item
  title = "", // lead
  text = "",
  anchor = "",
  searchCSV = "",
  non_normative = false,
  showLeadAsInstruction = false,
  lang = "de"
) {
  const template = non_normative
    ? tstandard_note_non_normative
    : tstandard_note_normative;
  return articleTxt(
    label,
    title,
    text,
    anchor,
    searchCSV,
    template,
    showLeadAsInstruction,
    lang
  );
}

function figureExample(
  label = "",
  title = "",
  legend = "",
  url = "",
  width = 1024,
  height = 472,
  anchor = ""
) {
  return figureTxt(
    label,
    title,
    legend,
    url,
    width,
    height,
    anchor,
    tFigure_example
  );
}
function figureSideNote(
  label = "",
  title = "",
  legend = "",
  url = "",
  width = 1024,
  height = 472,
  anchor = ""
) {
  return figureTxt(
    label,
    title,
    legend,
    url,
    width,
    height,
    anchor,
    tFigure_side_note
  );
}

function figureInfo(
  label = "",
  title = "",
  legend = "",
  url = "",
  width = 1024,
  height = 472,
  anchor = ""
) {
  return figureTxt(
    label,
    title,
    legend,
    url,
    width,
    height,
    anchor,
    tFigure_info
  );
}

function figureTxt(
  label = "",
  title = "",
  legend = "",
  url = "",
  width = 1024,
  height = 472,
  anchor = "",
  template = "",
  lang = "de"
) {
  label = !label || label === null ? "" : label;
  anchor = !anchor || anchor === null ? "" : anchor;
  legend = !legend || legend === null ? "" : legend;
  title = !title || title === null ? "" : title;

  return addAnchorAndCustomerIdAndTags(template, anchor, lang)
    .replace("£{itemlead}", itemLeadTag(label, ""))
    .replace("£{instruction}", instructionTag(title))
    .replace("£{legend}", legend)
    .replace("£{url}", url)
    .replace("£{width}", width)
    .replace("£{height}", height);
}

function addAnchorAndCustomerIdAndTags(inText, Ids = "", lang = "") {
  const [anchor, customerId] = Ids;
  if (!Ids || !anchor || anchor === "") {
    inText = inText.replace("\n£{anchor}", ""); // remove the anchor;
  }
  if (!Ids || !customerId || customerId === "") {
    inText = inText.replace("\n£{customerid}", ""); // remove the customerid;
  }

  inText = inText
    .replace("£{anchor}", tAnchor.replace("£{anchor}", anchor))
    .replace("£{customerid}", tCustomerid.replace("£{customerid}", customerId));

  return addTags(inText, lang);
}

function image(url, width, caption) {
  return tImage
    .replace("£{url}", url)
    .replace("£{width}", width)
    .replace("£{caption}", caption);
}

function listItemSimple(level, text) {
  const levelstr = TAB.repeat(level - 1);
  return tListSimple.replace("£{text}", text).replace("£{levelStr}", levelstr);
}

function listItemBullet(level, text) {
  const levelstr = TAB.repeat(level - 1);
  return tListbullet.replace("£{text}", text).replace("£{levelStr}", levelstr);
}

function listItemAlphaLower(level, text) {
  const levelstr = TAB.repeat(level - 1);
  return tListAlphaLower
    .replace("£{text}", text)
    .replace("£{levelStr}", levelstr);
}

function listItemAlphaUpper(level, text) {
  const levelstr = TAB.repeat(level - 1);
  return tListAlphaUpper
    .replace("£{text}", text)
    .replace("£{levelStr}", levelstr);
}
function listItemRomanUpper(level, text, startNo = 1) {
  const levelstr = TAB.repeat(level - 1);
  return tListRomanUpper
    .replace("£{startNo}", startNo)
    .replace("£{text}", text)
    .replace("£{levelStr}", levelstr);
}

function listItemRomanLower(level, text, startNo = 1) {
  const levelstr = TAB.repeat(level - 1);
  return tListRomanLower
    .replace("£{startNo}", startNo)
    .replace("£{text}", text)
    .replace("£{levelStr}", levelstr);
}

function listItemAlphaUpper(level, text) {
  const levelstr = TAB.repeat(level - 1);
  return tListAlphaUpper
    .replace("£{text}", text)
    .replace("£{levelStr}", levelstr);
}

function listItemNumbered(level, text, startNo = 1) {
  const levelstr = TAB.repeat(level - 1);
  return tListNumbered
    .replace("£{startNo}", startNo)
    .replace("£{text}", text)
    .replace("£{levelStr}", levelstr);
}

exports.chapter = chapter;
exports.book = book;
exports.article = article;
exports.image = image;
exports.listItemBullet = listItemBullet;
exports.listItemAlphaUpper = listItemAlphaUpper;
exports.listItemNumbered = listItemNumbered;
exports.listItemAlphaLower = listItemAlphaLower;
exports.listItemSimple = listItemSimple;

exports.listItemRomanUpper = listItemRomanUpper;
exports.listItemRomanLower = listItemRomanLower;
exports.standardRemark = standardRemark;

exports.standardRemarkTable = standardRemarkTable;
exports.sideNoteTable = sideNoteTable;
exports.exampleTable = exampleTable;
exports.sideNote = sideNote;
exports.note = note;

exports.example = example;
exports.info = info;
exports.figureRemark = figureRemark;
exports.figureExample = figureExample;
exports.figureSideNote = figureSideNote;
exports.figureInfo = figureInfo;

exports.standardImageFigure = standardImageFigure;
exports.standardTable = standardTable;
exports.standardArticle = standardArticle;
exports.standardNote = standardNote;
exports.imageInline = imageInline;
exports.externalLink = externalLink;
exports.formula = formula;
exports.legend = legend;
exports.TAB = TAB;
exports.SPACE = SPACE;

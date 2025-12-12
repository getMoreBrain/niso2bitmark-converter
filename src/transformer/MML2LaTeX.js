// MathConverterService.js
const { MathMLToLaTeX } = require("mathml-to-latex");

class MML2LaTeX {
  constructor() {}

  transform(mathmlString) {
    const formula = MathMLToLaTeX.convert(mathmlString);
    if (formula) {
      const updatedFormula = formula.replace(/\\hdots/g, "\\cdots"); // gmb-renderer does not support \hdots --> \cdots
      return `==\\begin{align*}${updatedFormula}\\end{align*}==|latex|`;
    } else {
      return `==Error in Formula==|latex|`;
    }
  }
}

module.exports = MML2LaTeX;

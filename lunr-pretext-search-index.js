var ptx_lunr_search_style = "textbook";
var ptx_lunr_docs = [
{
  "id": "front-colophon",
  "level": "1",
  "url": "front-colophon.html",
  "type": "Colophon",
  "number": "",
  "title": "Colophon",
  "body": "  "
},
{
  "id": "preface-start-here",
  "level": "1",
  "url": "preface-start-here.html",
  "type": "Preface",
  "number": "",
  "title": "How to Read this Book",
  "body": " How to Read this Book  Where I explain how you should approach this book. Considering calling this \"Start Here\" since the textbook is titled \"College Algebra from Here\".  "
},
{
  "id": "sec-quantities-expressions-and-equivalence",
  "level": "1",
  "url": "sec-quantities-expressions-and-equivalence.html",
  "type": "Section",
  "number": "1.1",
  "title": "Quantities, Expressions, and Equivalence",
  "body": " Quantities, Expressions, and Equivalence   Opening Example  Ariana is taking a picture of her friend on her phone. She experiments with different camera settings until she's happy with the photograph.  There are many quantities in this problem, some of which vary and some of which do not. For instance, the width of Ariana's friend's face on the screen is one quantity that varies. Identify at least two other quantities that vary and two quantities that remain fixed.   Student Thinking    Sidney  The width of her friend's face on the screen might change, but the actual width of her friend's face should remain the same so I think that's one fixed quantity. I guess the height of her friend's face on the screen could also vary as she zooms in and out.    Erika  I think maybe the distance from the camera could vary like if she moved closer to or further away from her friend? Maybe, also something about the brightness of the photo like if they turned on some extra lights in the room?      "
},
{
  "id": "sec-graphing",
  "level": "1",
  "url": "sec-graphing.html",
  "type": "Section",
  "number": "1.2",
  "title": "Graphing",
  "body": " Graphing  Text of section.  "
},
{
  "id": "sec-functions",
  "level": "1",
  "url": "sec-functions.html",
  "type": "Section",
  "number": "1.3",
  "title": "Functions",
  "body": " Functions  Text of section.  "
},
{
  "id": "sec-rates-of-change",
  "level": "1",
  "url": "sec-rates-of-change.html",
  "type": "Section",
  "number": "1.4",
  "title": "Rates of Change",
  "body": " Rates of Change  Text of section.  "
},
{
  "id": "sec-constant-rates-of-change",
  "level": "1",
  "url": "sec-constant-rates-of-change.html",
  "type": "Section",
  "number": "2.1",
  "title": "Constant Rates of Change",
  "body": " Constant Rates of Change  Text of section.  "
},
{
  "id": "sec-linear-equations",
  "level": "1",
  "url": "sec-linear-equations.html",
  "type": "Section",
  "number": "2.2",
  "title": "Linear Equations",
  "body": " Linear Equations  Text of section.  "
},
{
  "id": "ch-exponential-functions",
  "level": "1",
  "url": "ch-exponential-functions.html",
  "type": "Chapter",
  "number": "3",
  "title": "Exponential Functions",
  "body": " Exponential Functions   Text before the first section.    "
},
{
  "id": "ch-logarithms",
  "level": "1",
  "url": "ch-logarithms.html",
  "type": "Chapter",
  "number": "4",
  "title": "Logarithms",
  "body": " Logarithms   Text before the first section.    "
},
{
  "id": "ch-quadratic-functions",
  "level": "1",
  "url": "ch-quadratic-functions.html",
  "type": "Chapter",
  "number": "5",
  "title": "Quadratic Functions",
  "body": " Quadratic Functions   Text before the first section.    "
},
{
  "id": "ch-trigonometry",
  "level": "1",
  "url": "ch-trigonometry.html",
  "type": "Chapter",
  "number": "6",
  "title": "Trigonometry",
  "body": " Trigonometry   Text before the first section.    "
},
{
  "id": "backmatter-2",
  "level": "1",
  "url": "backmatter-2.html",
  "type": "Colophon",
  "number": "",
  "title": "Colophon",
  "body": " This book was authored in PreTeXt .  "
}
]

var ptx_lunr_idx = lunr(function () {
  this.ref('id')
  this.field('title')
  this.field('body')
  this.metadataWhitelist = ['position']

  ptx_lunr_docs.forEach(function (doc) {
    this.add(doc)
  }, this)
})

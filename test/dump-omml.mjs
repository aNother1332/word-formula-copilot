import temml from 'temml';
import { mml2omml } from 'mathml2omml';
const mathml = temml.renderToString('y_1 = \sin^3 x \cdot \frac{1}{\cos x}', { displayMode: false });
console.log('--- MathML ---');
console.log(mathml);
console.log('--- OMML ---');
console.log(mml2omml(mathml));

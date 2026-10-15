/* Checks of the lab-file readers with files written to each format's specification.
   Usage: node tests/formats/check.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..', '..');
const ctx = { console, Math, TextDecoder, DataView, ArrayBuffer, Float32Array, Uint8Array }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['assets/js/chem.js', 'assets/js/crystal.js', 'assets/js/formats.js']) vm.runInContext(fs.readFileSync(path.join(R, f), 'utf8'), ctx);
const { formats: F, xtal: X } = ctx.BF;
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n); } };
const near = (a, b, t) => Math.abs(a - b) <= t;

let r = F.parse('scan.csv', 'Temperature (K),Conductivity (S/cm)\n300,1.2e-5\n350,4.1e-5\n400,1.1e-4\n');
ok(r.kind === 'xy' && r.cols[0] === 'Temperature (K)' && r.rows.length === 3 && r.rows[2][1] === '1.1e-4', 'CSV with a header row');
r = F.parse('uvvis.txt', '# exported by spectrometer\nnm\tAbs\n400\t0,512\n410\t0,498\n420\t0,470\n');
ok(r.rows.length === 3 && r.rows[0][1] === '0.512' && r.cols[1] === 'Abs', 'tab-separated text with decimal commas and a comment line');
r = F.parse('pattern.xy', '10.00 120\n10.02 131\n10.04 128\n10.06 140\n');
ok(r.rows.length === 4 && r.cols.length === 2, 'whitespace-separated .xy');

/* JCAMP-DX: plain (AFFN), then compressed with SQZ/DIF and DUP */
r = F.parse('ir.jdx', '##TITLE=Polystyrene film\n##JCAMP-DX=4.24\n##XUNITS=1/CM\n##YUNITS=TRANSMITTANCE\n##XFACTOR=1\n##YFACTOR=0.001\n##FIRSTX=4000\n##LASTX=3996\n##NPOINTS=5\n##XYDATA=(X++(Y..Y))\n4000 900 910 920\n3997 930 940\n##END=\n');
ok(r.name === 'Polystyrene film' && r.rows.length === 5 && near(+r.rows[4][0], 3996, 1e-9) && near(+r.rows[4][1], 0.94, 1e-9), 'JCAMP-DX, uncompressed, with X and Y factors');
r = F.parse('raman.dx', '##TITLE=DIF test\n##XUNITS=1/CM\n##YUNITS=COUNTS\n##FIRSTX=100\n##LASTX=104\n##NPOINTS=5\n##XYDATA=(X++(Y..Y))\n100A0KL\n103A5%j\n##END=\n');
ok(r.rows.map(q => +q[1]).join(',') === '10,12,15,15,14' && +r.rows[3][0] === 103, 'JCAMP-DX DIF compression, with the check value dropped');
r = F.parse('dup.jdx', '##TITLE=DUP test\n##FIRSTX=0\n##LASTX=3\n##NPOINTS=4\n##XYDATA=(X++(Y..Y))\n0A0KS3\n##END=\n');
ok(r.rows.map(q => +q[1]).join(',') === '10,12,14,16', 'JCAMP-DX DUP compression repeats the difference');

/* XRD formats */
r = F.parse('Au.xrdml', `<?xml version="1.0"?><xrdMeasurements><xrdMeasurement><usedWavelength intended="K-Alpha 1"><kAlpha1 unit="Angstrom">1.5405980</kAlpha1></usedWavelength><scan><dataPoints><positions axis="2Theta" unit="deg"><startPosition>30.00</startPosition><endPosition>31.00</endPosition></positions><commonCountingTime unit="seconds">1.0</commonCountingTime><intensities unit="counts">10 12 15 13 11 9 10 11 12 10 9</intensities></dataPoints></scan></xrdMeasurement></xrdMeasurements>`);
ok(r.rows.length === 11 && +r.rows[10][0] === 31 && +r.rows[2][1] === 15 && near(r.meta.lambda, 1.540598, 1e-6), 'PANalytical XRDML: positions from start/end, intensities and wavelength');
r = F.parse('ZnO.ras', '*RAS_DATA_START\n*RAS_HEADER_START\n*HW_XG_WAVE_LENGTH_ALPHA1 "1.540593"\n*RAS_HEADER_END\n*RAS_INT_START\n20.00 150 1.0\n20.02 152 1.0\n20.04 149 1.0\n*RAS_INT_END\n*RAS_DATA_END\n');
ok(r.rows.length === 3 && r.rows[1][1] === '152' && near(r.meta.lambda, 1.540593, 1e-9), 'Rigaku RAS intensity block and wavelength');
r = F.parse('scan.uxd', '; Bruker UXD\n_START = 10.0\n_STEPSIZE = 0.05\n_COUNTS\n100 101 102\n103 104\n');
ok(r.rows.length === 5 && +r.rows[4][0] === 10.2 && r.rows[4][1] === '104', 'Bruker UXD with start and step size');

/* Thermo/Galactic SPC, new format, float data */
const n = 6, buf = new ArrayBuffer(512 + 32 + 4 * n), dv = new DataView(buf);
dv.setUint8(0, 0); dv.setUint8(1, 0x4B); dv.setInt8(3, -128); dv.setInt32(4, n, true); dv.setFloat64(8, 400, true); dv.setFloat64(16, 900, true); dv.setUint8(28, 13); dv.setUint8(29, 4);
dv.setInt8(512 + 1, -128);
[5, 7, 9, 11, 7, 5].forEach((y, i) => dv.setFloat32(544 + 4 * i, y, true));
r = F.parse('raman.spc', buf);
ok(r.rows.length === 6 && +r.rows[5][0] === 900 && +r.rows[3][1] === 11 && r.cols[0] === 'Raman shift (cm⁻¹)', 'Galactic SPC: evenly spaced X, float Y, axis types');

/* CIF: wurtzite ZnO in P6_3mc, expanded by its 12 operations */
const cif = `data_ZnO
_cell_length_a 3.2498(1)
_cell_length_b 3.2498(1)
_cell_length_c 5.2066(2)
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 120
_symmetry_Int_Tables_number 186
_chemical_formula_sum 'Zn O'
loop_
_symmetry_equiv_pos_as_xyz
'x, y, z'
'-y, x-y, z'
'-x+y, -x, z'
'-x, -y, z+1/2'
'y, -x+y, z+1/2'
'x-y, x, z+1/2'
'-y, -x, z'
'-x+y, y, z'
'x, x-y, z'
'y, x, z+1/2'
'x-y, -y, z+1/2'
'-x, -x+y, z+1/2'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
_atom_site_occupancy
Zn1 Zn2+ 0.33333 0.66667 0.0000 1.0
O1 O2- 0.33333 0.66667 0.3820 1.0
`;
r = F.parse('ZnO.cif', cif);
ok(r.kind === 'structure' && r.structure.positions.length === 4 && r.meta.spacegroup === 186 && r.meta.ops === 12, 'CIF: 12 symmetry operations expand 2 sites to the 4 atoms of wurtzite');
const pat = X.xrd(r.structure, { tmin: 25, tmax: 70 });
const at = h => pat.find(p => p.hkl.join('') === h);
console.log('     ZnO from CIF:', pat.filter(p => p.rel > 15).map(p => `${p.tt.toFixed(2)}° (${p.hkl.join('')})`).join(', '));
ok(at('100') && near(at('100').tt, 31.77, 0.05) && at('002') && near(at('002').tt, 34.42, 0.05) && at('101') && near(at('101').tt, 36.25, 0.05) && at('101').rel === 100, 'CIF → simulated XRD: ZnO (100), (002), (101) at the reference angles, (101) strongest');

/* convex hull: binary A–B with AB at −1 eV/atom; A2B lies on the AB–A tie line */
let h = X.hullEnergy([{ name: 'AB', x: { Cu: 0.5, S: 0.5 }, e: -1 }], { Cu: 2, S: 1 });
ok(h && Math.abs(h.e + 2 / 3) < 1e-9 && h.parts.map(q => q.name).sort().join('+') === 'AB+Cu', 'hull energy of Cu2S between CuS and Cu: −0.667 eV/atom');
h = X.hullEnergy([{ name: 'A2B', x: { Li: 2 / 3, O: 1 / 3 }, e: -2.1 }, { name: 'AB', x: { Li: 0.5, O: 0.5 }, e: -1.8 }, { name: 'AB2', x: { Li: 1 / 3, O: 2 / 3 }, e: -0.9 }], { Li: 1, O: 1 });
ok(h && Math.abs(h.e + 1.8) < 1e-9 && h.parts.length === 1 && h.parts[0].name === 'AB', 'LiO sits on the hull itself (−1.8 eV/atom beats the A2B–AB2 tie line at −1.5)');
h = X.hullEnergy([{ name: 'ZnS', x: { Zn: 0.5, S: 0.5 }, e: -0.95 }, { name: 'Cu2S', x: { Cu: 2 / 3, S: 1 / 3 }, e: -0.3 }, { name: 'SnS2', x: { Sn: 1 / 3, S: 2 / 3 }, e: -0.55 }], { Cu: 2, Zn: 1, Sn: 1, S: 4 });
const want = (3 * (-0.3) + 2 * (-0.95) + 3 * (-0.55)) / 8;
ok(h && Math.abs(h.e - want) < 1e-6 && h.parts.length === 3, 'quaternary Cu2ZnSnS4 decomposes into Cu2S + ZnS + SnS2 (hull ' + (h && h.e.toFixed(3)) + ' eV/atom)');

/* unsupported vendor binaries explain what to do */
let msg = ''; try { F.parse('scan.raw', new ArrayBuffer(8)); } catch (e) { msg = e.message; }
ok(/Export the scan as \.xy/.test(msg), 'binary .raw files get clear export instructions');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

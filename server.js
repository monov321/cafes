const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { WebpayPlus, Options, IntegrationApiKeys, Environment, IntegrationCommerceCodes } = require('transbank-sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = ' SANJLODJALKDJAKLDSAJDKLAJDAKDLSAD';

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect('mongodb+srv://vuduUser:DLp7Bjxj7YABx30q@cluster0.nrw4x.mongodb.net/?appName=Cluster0');

const adminSchema = new mongoose.Schema({
    rut: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

const productSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: String,
    price: Number,
    img: String,
    desc: String,
    origin: String,
    roast: String,
    stock: { type: Number, default: 0 }
});

const textSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: String
});

const orderSchema = new mongoose.Schema({
    buyOrder: String,
    sessionId: String,
    amount: Number,
    token: String,
    status: String,
    date: { type: Date, default: Date.now },
    items: Array
});

const Admin = mongoose.model('Admin', adminSchema);
const Product = mongoose.model('Product', productSchema);
const TextContent = mongoose.model('TextContent', textSchema);
const Order = mongoose.model('Order', orderSchema);

const tx = new WebpayPlus.Transaction(
    new Options(
        IntegrationCommerceCodes.WEBPAY_PLUS,
        IntegrationApiKeys.WEBPAY,
        Environment.Integration
    )
);

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'No token provided' });
    jwt.verify(token.split(' ')[1], JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Unauthorized' });
        req.adminId = decoded.id;
        next();
    });
};

app.post('/api/auth/login', async (req, res) => {
    const { rut, password } = req.body;
    try {
        const admin = await Admin.findOne({ rut });
        if (!admin) return res.status(404).json({ error: 'Admin no encontrado' });
        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });
        const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: '24h' });
        res.status(200).json({ token });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ id: 1 });
        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener productos' });
    }
});

app.post('/api/admin/products', verifyToken, async (req, res) => {
    try {
        const highestProduct = await Product.findOne().sort({ id: -1 });
        const newId = highestProduct ? highestProduct.id + 1 : 1;
        
        const newProduct = new Product({
            id: newId,
            name: req.body.name,
            price: Number(req.body.price),
            img: req.body.img,
            desc: req.body.desc,
            origin: req.body.origin,
            roast: req.body.roast,
            stock: Number(req.body.stock)
        });
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear producto' });
    }
});

app.put('/api/admin/products/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updatedProduct = await Product.findOneAndUpdate(
            { id: Number(id) },
            {
                name: req.body.name,
                price: Number(req.body.price),
                img: req.body.img,
                desc: req.body.desc,
                origin: req.body.origin,
                roast: req.body.roast,
                stock: Number(req.body.stock)
            },
            { new: true }
        );
        res.status(200).json(updatedProduct);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar producto' });
    }
});

app.delete('/api/admin/products/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        await Product.findOneAndDelete({ id: Number(id) });
        res.status(200).json({ message: 'Producto eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar producto' });
    }
});

app.get('/api/texts', async (req, res) => {
    try {
        const texts = await TextContent.find();
        const textMap = {};
        texts.forEach(t => textMap[t.key] = t.value);
        res.status(200).json(textMap);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener textos' });
    }
});

app.put('/api/admin/texts', verifyToken, async (req, res) => {
    try {
        const updates = req.body;
        for (const key in updates) {
            await TextContent.findOneAndUpdate({ key }, { value: updates[key] }, { upsert: true });
        }
        res.status(200).json({ message: 'Textos actualizados' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar textos' });
    }
});

app.get('/api/admin/orders', verifyToken, async (req, res) => {
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const orders = await Order.find({ date: { $gte: sevenDaysAgo }, status: 'AUTHORIZED' }).sort({ date: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener órdenes' });
    }
});

app.post('/api/webpay/create', async (req, res, next) => {
    try {
        const { amount, sessionId, buyOrder, items } = req.body;
        
        for (const item of items) {
            const product = await Product.findOne({ id: item.id });
            if (!product || product.stock < item.quantity) {
                return res.status(400).json({ error: `Stock insuficiente para ${item.name}` });
            }
        }

        const returnUrl = `http://localhost:${PORT}/api/webpay/commit`;
        const createResponse = await tx.create(buyOrder, sessionId, amount, returnUrl);
        
        const newOrder = new Order({
            buyOrder,
            sessionId,
            amount,
            token: createResponse.token,
            status: 'PENDING',
            items
        });
        await newOrder.save();

        res.status(200).json({
            url: createResponse.url,
            token: createResponse.token
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/webpay/commit', async (req, res, next) => {
    try {
        const token = req.query.token_ws || req.body.token_ws;
        
        if (!token) {
            return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
            <meta charset="UTF-8">
            <title>Transacción Abortada</title>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
            <style>
            body { font-family: 'Poppins', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #fce4e4; margin: 0; text-align: center; }
            .container { background: white; padding: 3rem; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
            h1 { color: #d32f2f; }
            a { display: inline-block; margin-top: 1rem; padding: 10px 20px; background: #3e2723; color: white; text-decoration: none; border-radius: 5px; }
            </style>
            </head>
            <body>
            <div class="container">
            <h1>Transacción Cancelada</h1>
            <p>Has cancelado el proceso de pago o el token es invalido.</p>
            <a href="/">Volver a la tienda</a>
            </div>
            </body>
            </html>
            `);
        }
        
        const commitResponse = await tx.commit(token);
        const order = await Order.findOne({ token });

        if (commitResponse.status === 'AUTHORIZED') {
            order.status = 'AUTHORIZED';
            await order.save();

            for (const item of order.items) {
                await Product.findOneAndUpdate({ id: item.id }, { $inc: { stock: -item.quantity } });
            }

            res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
            <meta charset="UTF-8">
            <title>Pago Exitoso</title>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
            <style>
            body { font-family: 'Poppins', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #e8f5e9; margin: 0; text-align: center; }
            .container { background: white; padding: 3rem; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
            h1 { color: #2e7d32; }
            .details { margin: 2rem 0; text-align: left; background: #f5f5f5; padding: 1.5rem; border-radius: 8px; }
            a { display: inline-block; padding: 10px 20px; background: #3e2723; color: white; text-decoration: none; border-radius: 5px; }
            </style>
            </head>
            <body>
            <div class="container">
            <h1>Pago Exitoso</h1>
            <p>Tu orden ha sido procesada correctamente.</p>
            <div class="details">
            <p><strong>Orden:</strong> ${commitResponse.buy_order}</p>
            <p><strong>Monto:</strong> $${commitResponse.amount.toLocaleString('es-CL')}</p>
            <p><strong>Codigo Autorización:</strong> ${commitResponse.authorization_code}</p>
            <p><strong>Fecha:</strong> ${new Date(commitResponse.transaction_date).toLocaleString('es-CL')}</p>
            </div>
            <a href="/">Volver al Inicio</a>
            </div>
            </body>
            </html>
            `);
        } else {
            order.status = 'REJECTED';
            await order.save();

            res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
            <meta charset="UTF-8">
            <title>Pago Rechazado</title>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
            <style>
            body { font-family: 'Poppins', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #fff3e0; margin: 0; text-align: center; }
            .container { background: white; padding: 3rem; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
            h1 { color: #e65100; }
            a { display: inline-block; margin-top: 1rem; padding: 10px 20px; background: #3e2723; color: white; text-decoration: none; border-radius: 5px; }
            </style>
            </head>
            <body>
            <div class="container">
            <h1>Pago Rechazado</h1>
            <p>El banco ha rechazado la transacción. Por favor, intenta con otro medio de pago.</p>
            <a href="/">Volver a la tienda</a>
            </div>
            </body>
            </html>
            `);
        }
    } catch (error) {
        next(error);
    }
});

app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        error: 'Error Interno del Servidor',
        message: err.message || 'Ha ocurrido un error inesperado al procesar la solicitud'
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

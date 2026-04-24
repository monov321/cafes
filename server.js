const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebpayPlus, Options, IntegrationApiKeys, Environment, IntegrationCommerceCodes } = require('transbank-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const tx = new WebpayPlus.Transaction(
    new Options(
        IntegrationCommerceCodes.WEBPAY_PLUS,
        IntegrationApiKeys.WEBPAY,
        Environment.Integration
    )
);

app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Servidor NovaCafe operativo' 
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/webpay/create', async (req, res, next) => {
    try {
        const { amount, sessionId, buyOrder } = req.body;
        const returnUrl = `http://localhost:${PORT}/api/webpay/commit`;
        
        const createResponse = await tx.create(
            buyOrder,
            sessionId,
            amount,
            returnUrl
        );
        
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
        
        if (commitResponse.status === 'AUTHORIZED') {
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
    console.error(err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        error: 'Error Interno del Servidor',
        message: err.message || 'Ha ocurrido un error inesperado al procesar la solicitud con Transbank'
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
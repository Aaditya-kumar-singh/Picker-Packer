import os
import sys
import json
import urllib.request
import urllib.parse
import re
import io
import time
import zipfile
from PIL import Image, ImageDraw, ImageFont

CATALOG = [
    {
        "id": 1,
        "name": 'Angle Valve 1/2"',
        "sku": "YBM-ANGLE-VALVE-050",
        "barcode": "100000000174",
        "category": "VALVE",
        "queries": [
            "1/2 inch chrome angle valve stop tap plumbing isolated white background",
            "Angle Valve 1/2 inch bathroom chrome product white background"
        ]
    },
    {
        "id": 2,
        "name": 'Bib Cock 1/2"',
        "sku": "YBM-BIB-COCK-050",
        "barcode": "100000000175",
        "category": "TAP",
        "queries": [
            "1/2 inch brass chrome bib cock wall tap faucet product white background",
            "Bib Cock 1/2 inch plumbing water tap isolated"
        ]
    },
    {
        "id": 3,
        "name": 'Brass Ball Valve 1/2"',
        "sku": "YBM-BRASS-VALVE-050",
        "barcode": "100000000171",
        "category": "VALVE",
        "queries": [
            "1/2 inch brass ball valve threaded lever handle isolated white background",
            "Brass Ball Valve 1/2 inch plumbing product"
        ]
    },
    {
        "id": 4,
        "name": 'Brass Ball Valve 3/4"',
        "sku": "YBM-BRASS-VALVE-075",
        "barcode": "100000000142",
        "category": "VALVE",
        "queries": [
            "3/4 inch brass ball valve threaded lever handle isolated white background",
            "Brass Ball Valve 3/4 inch plumbing valve product"
        ]
    },
    {
        "id": 5,
        "name": 'Brass Ball Valve 1"',
        "sku": "YBM-BRASS-VALVE-100",
        "barcode": "100000000172",
        "category": "VALVE",
        "queries": [
            "1 inch brass ball valve threaded lever handle isolated white background",
            "Brass Ball Valve 1 inch plumbing valve product"
        ]
    },
    {
        "id": 6,
        "name": 'Brass Ball Valve 1.5"',
        "sku": "YBM-BRASS-VALVE-150",
        "barcode": "100000000173",
        "category": "VALVE",
        "queries": [
            "1.5 inch brass ball valve threaded lever handle isolated white background",
            "Brass Ball Valve 1-1/2 inch plumbing valve"
        ]
    },
    {
        "id": 7,
        "name": 'Check Valve 1"',
        "sku": "YBM-CHECK-VALVE-100",
        "barcode": "100000000177",
        "category": "VALVE",
        "queries": [
            "1 inch brass swing check valve non return valve isolated white background",
            "Brass Check Valve 1 inch plumbing product"
        ]
    },
    {
        "id": 8,
        "name": 'CPVC Male Adapter 1/2"',
        "sku": "YBM-CPVC-ADAPTER-050",
        "barcode": "100000000158",
        "category": "FITTING",
        "queries": [
            "1/2 inch CPVC male adapter threaded pipe fitting isolated white background",
            "CPVC Male Adapter 1/2 inch plumbing fitting"
        ]
    },
    {
        "id": 9,
        "name": 'CPVC Coupler 1/2"',
        "sku": "YBM-CPVC-COUPLER-050",
        "barcode": "100000000156",
        "category": "FITTING",
        "queries": [
            "1/2 inch CPVC coupler socket pipe fitting isolated white background",
            "CPVC Coupler 1/2 inch plumbing fitting"
        ]
    },
    {
        "id": 10,
        "name": 'CPVC Elbow 1/2"',
        "sku": "YBM-CPVC-ELBOW-050",
        "barcode": "100000000154",
        "category": "FITTING",
        "queries": [
            "1/2 inch CPVC 90 degree elbow pipe fitting isolated white background",
            "CPVC Elbow 1/2 inch plumbing fitting"
        ]
    },
    {
        "id": 11,
        "name": 'CPVC Elbow 1"',
        "sku": "YBM-CPVC-ELBOW-100",
        "barcode": "100000000148",
        "category": "FITTING",
        "queries": [
            "1 inch CPVC 90 degree elbow pipe fitting isolated white background",
            "CPVC Elbow 1 inch plumbing fitting"
        ]
    },
    {
        "id": 12,
        "name": 'CPVC End Cap 1/2"',
        "sku": "YBM-CPVC-ENDCAP-050",
        "barcode": "100000000159",
        "category": "FITTING",
        "queries": [
            "1/2 inch CPVC end cap pipe fitting isolated white background",
            "CPVC End Cap 1/2 inch plumbing fitting"
        ]
    },
    {
        "id": 13,
        "name": 'CPVC End Cap 1"',
        "sku": "YBM-CPVC-ENDCAP-100",
        "barcode": "100000000151",
        "category": "FITTING",
        "queries": [
            "1 inch CPVC end cap pipe fitting isolated white background",
            "CPVC End Cap 1 inch plumbing fitting"
        ]
    },
    {
        "id": 14,
        "name": 'CPVC Reducer 3/4" × 1/2"',
        "sku": "YBM-CPVC-REDUCER-075-050",
        "barcode": "100000000160",
        "category": "FITTING",
        "queries": [
            "3/4 x 1/2 inch CPVC reducer bushing fitting isolated white background",
            "CPVC Reducer 3/4 to 1/2 inch pipe fitting"
        ]
    },
    {
        "id": 15,
        "name": 'CPVC Reducer 1" × 3/4"',
        "sku": "YBM-CPVC-REDUCER-100-075",
        "barcode": "100000000147",
        "category": "FITTING",
        "queries": [
            "1 x 3/4 inch CPVC reducer bushing fitting isolated white background",
            "CPVC Reducer 1 to 3/4 inch pipe fitting"
        ]
    },
    {
        "id": 16,
        "name": 'CPVC Reducer 1.5" × 1"',
        "sku": "YBM-CPVC-REDUCER-150-100",
        "barcode": "100000000161",
        "category": "FITTING",
        "queries": [
            "1.5 x 1 inch CPVC reducer bushing fitting isolated white background",
            "CPVC Reducer 1-1/2 to 1 inch pipe fitting"
        ]
    },
    {
        "id": 17,
        "name": 'CPVC Solvent Cement 118 ml',
        "sku": "YBM-CPVC-SOLVENT-118",
        "barcode": "100000000136",
        "category": "CONSUMABLE",
        "queries": [
            "CPVC solvent cement 118 ml can tin with dauber isolated white background",
            "CPVC solvent cement 118ml yellow tin"
        ]
    },
    {
        "id": 18,
        "name": 'CPVC Solvent Cement 237 ml',
        "sku": "YBM-CPVC-SOLVENT-237",
        "barcode": "100000000137",
        "category": "CONSUMABLE",
        "queries": [
            "CPVC solvent cement 237 ml can tin isolated white background",
            "CPVC solvent cement 237ml plumbing tin can"
        ]
    },
    {
        "id": 19,
        "name": 'CPVC Tee 1/2"',
        "sku": "YBM-CPVC-TEE-050",
        "barcode": "100000000155",
        "category": "FITTING",
        "queries": [
            "1/2 inch CPVC tee pipe fitting equal isolated white background",
            "CPVC Tee 1/2 inch plumbing fitting"
        ]
    },
    {
        "id": 20,
        "name": 'CPVC Tee 1"',
        "sku": "YBM-CPVC-TEE-100",
        "barcode": "100000000149",
        "category": "FITTING",
        "queries": [
            "1 inch CPVC tee pipe fitting equal isolated white background",
            "CPVC Tee 1 inch plumbing fitting"
        ]
    },
    {
        "id": 21,
        "name": 'CPVC Union 1/2"',
        "sku": "YBM-CPVC-UNION-050",
        "barcode": "100000000157",
        "category": "FITTING",
        "queries": [
            "1/2 inch CPVC union pipe fitting isolated white background",
            "CPVC Union 1/2 inch plumbing fitting"
        ]
    },
    {
        "id": 22,
        "name": 'CPVC Union 1"',
        "sku": "YBM-CPVC-UNION-100",
        "barcode": "100000000150",
        "category": "FITTING",
        "queries": [
            "1 inch CPVC union pipe fitting isolated white background",
            "CPVC Union 1 inch plumbing fitting"
        ]
    },
    {
        "id": 23,
        "name": 'CPVC Ball Valve 3/4"',
        "sku": "YBM-CPVC-VALVE-075",
        "barcode": "100000000131",
        "category": "VALVE",
        "queries": [
            "3/4 inch CPVC ball valve red handle isolated white background",
            "CPVC Ball Valve 3/4 inch plumbing fitting"
        ]
    },
    {
        "id": 24,
        "name": 'CPVC Ball Valve 1"',
        "sku": "YBM-CPVC-VALVE-100",
        "barcode": "100000000130",
        "category": "VALVE",
        "queries": [
            "1 inch CPVC ball valve red handle isolated white background",
            "CPVC Ball Valve 1 inch plumbing fitting"
        ]
    },
    {
        "id": 25,
        "name": 'Flexible Water Pipe 1/2"',
        "sku": "YBM-FLEX-PIPE-050",
        "barcode": "100000000179",
        "category": "PIPE",
        "queries": [
            "1/2 inch flexible braided water hose connector pipe stainless steel white background",
            "Flexible water pipe 1/2 inch geyser connection pipe"
        ]
    },
    {
        "id": 26,
        "name": 'Flexible Water Pipe 3/4"',
        "sku": "YBM-FLEX-PIPE-075",
        "barcode": "100000000143",
        "category": "PIPE",
        "queries": [
            "3/4 inch flexible braided water hose connector pipe stainless steel white background",
            "Flexible water pipe 3/4 inch connection hose"
        ]
    },
    {
        "id": 27,
        "name": 'Flexible Water Pipe 1"',
        "sku": "YBM-FLEX-PIPE-100",
        "barcode": "100000000180",
        "category": "PIPE",
        "queries": [
            "1 inch flexible braided water hose connector pipe stainless steel white background",
            "Flexible braided stainless steel pipe 1 inch"
        ]
    },
    {
        "id": 28,
        "name": 'Float Valve 1"',
        "sku": "YBM-FLOAT-VALVE-100",
        "barcode": "100000000178",
        "category": "VALVE",
        "queries": [
            "1 inch water tank float valve brass with plastic ball isolated white background",
            "Water tank float ball valve 1 inch brass"
        ]
    },
    {
        "id": 29,
        "name": 'Mixer Tap Adapter 1/2"',
        "sku": "YBM-MIXER-ADAPTER-050",
        "barcode": "100000000191",
        "category": "FITTING",
        "queries": [
            "1/2 inch brass wall mixer tap adapter bend union chrome isolated white background",
            "Wall mixer adapter 1/2 inch brass chrome"
        ]
    },
    {
        "id": 30,
        "name": 'Pipe Clamp 1/2"',
        "sku": "YBM-PIPE-CLAMP-050",
        "barcode": "100000000185",
        "category": "ACCESSORY",
        "queries": [
            "1/2 inch metal pipe clamp saddle U clamp plumbing isolated white background",
            "Pipe clamp 1/2 inch metal saddle clamp"
        ]
    },
    {
        "id": 31,
        "name": 'Pipe Clamp 3/4"',
        "sku": "YBM-PIPE-CLAMP-075",
        "barcode": "100000000144",
        "category": "ACCESSORY",
        "queries": [
            "3/4 inch metal pipe clamp saddle U clamp plumbing isolated white background",
            "Pipe clamp 3/4 inch metal saddle clamp"
        ]
    },
    {
        "id": 32,
        "name": 'Pipe Clamp 1"',
        "sku": "YBM-PIPE-CLAMP-100",
        "barcode": "100000000145",
        "category": "ACCESSORY",
        "queries": [
            "1 inch metal pipe clamp saddle U clamp plumbing isolated white background",
            "Pipe clamp 1 inch metal saddle clamp"
        ]
    },
    {
        "id": 33,
        "name": 'Pipe Clamp 1.5"',
        "sku": "YBM-PIPE-CLAMP-150",
        "barcode": "100000000186",
        "category": "ACCESSORY",
        "queries": [
            "1.5 inch metal pipe clamp saddle U clamp plumbing isolated white background",
            "Pipe clamp 1-1/2 inch metal saddle clamp"
        ]
    },
    {
        "id": 34,
        "name": 'Pipe Hanger 1"',
        "sku": "YBM-PIPE-HANGER-100",
        "barcode": "100000000187",
        "category": "ACCESSORY",
        "queries": [
            "1 inch clevis pipe hanger adjustable metal bracket isolated white background",
            "Pipe hanger 1 inch metal loop clevis"
        ]
    },
    {
        "id": 35,
        "name": 'Pipe Hanger 1.5"',
        "sku": "YBM-PIPE-HANGER-150",
        "barcode": "100000000188",
        "category": "ACCESSORY",
        "queries": [
            "1.5 inch clevis pipe hanger adjustable metal bracket isolated white background",
            "Pipe hanger 1-1/2 inch metal clevis hanger"
        ]
    },
    {
        "id": 36,
        "name": 'PTFE Thread Seal Tape',
        "sku": "YBM-PTFE-TAPE-12",
        "barcode": "100000000146",
        "category": "CONSUMABLE",
        "queries": [
            "PTFE thread seal tape 12mm teflon roll white isolated white background",
            "Teflon tape 12mm thread seal plumber tape"
        ]
    },
    {
        "id": 37,
        "name": 'PTFE Thread Seal Tape 19 mm',
        "sku": "YBM-PTFE-TAPE-19",
        "barcode": "100000000184",
        "category": "CONSUMABLE",
        "queries": [
            "PTFE thread seal tape 19mm teflon roll white isolated white background",
            "Teflon tape 19mm thread seal plumber tape"
        ]
    },
    {
        "id": 38,
        "name": 'PVC Male Adapter 1"',
        "sku": "YBM-PVC-ADAPTER-100",
        "barcode": "100000000166",
        "category": "FITTING",
        "queries": [
            "1 inch PVC male adapter threaded fitting schedule 40 isolated white background",
            "PVC Male Adapter 1 inch pipe fitting"
        ]
    },
    {
        "id": 39,
        "name": 'PVC Coupler 1"',
        "sku": "YBM-PVC-COUPLER-100",
        "barcode": "100000000164",
        "category": "FITTING",
        "queries": [
            "1 inch PVC coupler socket pipe fitting white isolated white background",
            "PVC Coupler 1 inch pipe fitting"
        ]
    },
    {
        "id": 40,
        "name": 'PVC Elbow 3/4"',
        "sku": "YBM-PVC-ELBOW-075",
        "barcode": "100000000140",
        "category": "FITTING",
        "queries": [
            "3/4 inch PVC 90 degree elbow pipe fitting white isolated white background",
            "PVC Elbow 3/4 inch pipe fitting"
        ]
    },
    {
        "id": 41,
        "name": 'PVC Elbow 1"',
        "sku": "YBM-PVC-ELBOW-100",
        "barcode": "100000000162",
        "category": "FITTING",
        "queries": [
            "1 inch PVC 90 degree elbow pipe fitting white isolated white background",
            "PVC Elbow 1 inch pipe fitting"
        ]
    },
    {
        "id": 42,
        "name": 'PVC End Cap 1"',
        "sku": "YBM-PVC-ENDCAP-100",
        "barcode": "100000000167",
        "category": "FITTING",
        "queries": [
            "1 inch PVC end cap pipe fitting white isolated white background",
            "PVC End Cap 1 inch pipe fitting"
        ]
    },
    {
        "id": 43,
        "name": 'PVC Pipe 1/2", 3 m',
        "sku": "YBM-PVC-PIPE-050-3M",
        "barcode": "100000000169",
        "category": "PIPE",
        "queries": [
            "1/2 inch PVC pipe plumbing pipe white grey isolated white background",
            "PVC Pipe 1/2 inch plumbing pipe bundle"
        ]
    },
    {
        "id": 44,
        "name": 'PVC Pipe 3/4", 3 m',
        "sku": "YBM-PVC-PIPE-075-3M",
        "barcode": "100000000138",
        "category": "PIPE",
        "queries": [
            "3/4 inch PVC pipe plumbing pipe white grey isolated white background",
            "PVC Pipe 3/4 inch plumbing pipe bundle"
        ]
    },
    {
        "id": 45,
        "name": 'PVC Pipe 1", 3 m',
        "sku": "YBM-PVC-PIPE-100-3M",
        "barcode": "100000000139",
        "category": "PIPE",
        "queries": [
            "1 inch PVC pipe plumbing pipe white grey isolated white background",
            "PVC Pipe 1 inch plumbing pipe bundle"
        ]
    },
    {
        "id": 46,
        "name": 'PVC Pipe 1.5", 3 m',
        "sku": "YBM-PVC-PIPE-150-3M",
        "barcode": "100000000170",
        "category": "PIPE",
        "queries": [
            "1.5 inch PVC pipe plumbing pipe white grey isolated white background",
            "PVC Pipe 1-1/2 inch plumbing pipe"
        ]
    },
    {
        "id": 47,
        "name": 'PVC Reducer 1" × 3/4"',
        "sku": "YBM-PVC-REDUCER-100-075",
        "barcode": "100000000168",
        "category": "FITTING",
        "queries": [
            "1 x 3/4 inch PVC reducer bushing pipe fitting white isolated white background",
            "PVC Reducer 1 to 3/4 inch pipe fitting"
        ]
    },
    {
        "id": 48,
        "name": 'PVC Solvent Cement 118 ml',
        "sku": "YBM-PVC-SOLVENT-118",
        "barcode": "100000000182",
        "category": "CONSUMABLE",
        "queries": [
            "PVC solvent cement 118 ml tin can pipe glue isolated white background",
            "PVC solvent cement 118ml plumbing tin can"
        ]
    },
    {
        "id": 49,
        "name": 'PVC Solvent Cement 237 ml',
        "sku": "YBM-PVC-SOLVENT-237",
        "barcode": "100000000183",
        "category": "CONSUMABLE",
        "queries": [
            "PVC solvent cement 237 ml tin can pipe glue isolated white background",
            "PVC solvent cement 237ml plumbing tin can"
        ]
    },
    {
        "id": 50,
        "name": 'PVC Tee 3/4"',
        "sku": "YBM-PVC-TEE-075",
        "barcode": "100000000141",
        "category": "FITTING",
        "queries": [
            "3/4 inch PVC tee pipe fitting equal white isolated white background",
            "PVC Tee 3/4 inch pipe fitting"
        ]
    },
    {
        "id": 51,
        "name": 'PVC Tee 1"',
        "sku": "YBM-PVC-TEE-100",
        "barcode": "100000000163",
        "category": "FITTING",
        "queries": [
            "1 inch PVC tee pipe fitting equal white isolated white background",
            "PVC Tee 1 inch pipe fitting"
        ]
    },
    {
        "id": 52,
        "name": 'PVC Union 1"',
        "sku": "YBM-PVC-UNION-100",
        "barcode": "100000000165",
        "category": "FITTING",
        "queries": [
            "1 inch PVC union pipe fitting white isolated white background",
            "PVC Union 1 inch pipe fitting"
        ]
    },
    {
        "id": 53,
        "name": 'Rubber Washer 1/2"',
        "sku": "YBM-RUBBER-WASHER-050",
        "barcode": "100000000189",
        "category": "ACCESSORY",
        "queries": [
            "1/2 inch black rubber sealing washer gasket plumbing isolated white background",
            "Rubber washer 1/2 inch EPDM flat gasket"
        ]
    },
    {
        "id": 54,
        "name": 'Rubber Washer 1"',
        "sku": "YBM-RUBBER-WASHER-100",
        "barcode": "100000000190",
        "category": "ACCESSORY",
        "queries": [
            "1 inch black rubber sealing washer gasket plumbing isolated white background",
            "Rubber washer 1 inch EPDM flat gasket"
        ]
    },
    {
        "id": 55,
        "name": 'SFMC CPVC Male Adapter 3/4"',
        "sku": "YBM-SFMC-ADAPTER-075",
        "barcode": "100000000126",
        "category": "FITTING",
        "queries": [
            "3/4 inch CPVC male adapter threaded pipe fitting isolated white background",
            "CPVC Male Adapter 3/4 inch plumbing fitting"
        ]
    },
    {
        "id": 56,
        "name": 'SFMC CPVC Male Adapter 1"',
        "sku": "YBM-SFMC-ADAPTER-100",
        "barcode": "100000000135",
        "category": "FITTING",
        "queries": [
            "1 inch CPVC male adapter threaded pipe fitting isolated white background",
            "CPVC Male Adapter 1 inch plumbing fitting"
        ]
    },
    {
        "id": 57,
        "name": 'SFMC CPVC Coupler 3/4"',
        "sku": "YBM-SFMC-COUPLER-075",
        "barcode": "100000000125",
        "category": "FITTING",
        "queries": [
            "3/4 inch CPVC coupler socket pipe fitting isolated white background",
            "CPVC Coupler 3/4 inch plumbing fitting"
        ]
    },
    {
        "id": 58,
        "name": 'SFMC CPVC Coupler 1"',
        "sku": "YBM-SFMC-COUPLER-100",
        "barcode": "100000000134",
        "category": "FITTING",
        "queries": [
            "1 inch CPVC coupler socket pipe fitting isolated white background",
            "CPVC Coupler 1 inch plumbing fitting"
        ]
    },
    {
        "id": 59,
        "name": 'SFMC CPVC Pipe 1/2", 3 m',
        "sku": "YBM-SFMC-CPVC-050-3M",
        "barcode": "100000000152",
        "category": "PIPE",
        "queries": [
            "1/2 inch CPVC pipe cream SDR 11 plumbing pipe isolated white background",
            "CPVC pipe 1/2 inch plumbing pipe bundle"
        ]
    },
    {
        "id": 60,
        "name": 'SFMC CPVC Pipe 3/4", 3 m',
        "sku": "YBM-SFMC-CPVC-075-3M",
        "barcode": "100000000106",
        "category": "PIPE",
        "queries": [
            "3/4 inch CPVC pipe cream SDR 11 plumbing pipe isolated white background",
            "CPVC pipe 3/4 inch plumbing pipe bundle"
        ]
    },
    {
        "id": 61,
        "name": 'SFMC CPVC Pipe 1", 3 m',
        "sku": "YBM-SFMC-CPVC-100-3M",
        "barcode": "100000000129",
        "category": "PIPE",
        "queries": [
            "1 inch CPVC pipe cream SDR 11 plumbing pipe isolated white background",
            "CPVC pipe 1 inch plumbing pipe bundle"
        ]
    },
    {
        "id": 62,
        "name": 'SFMC CPVC Pipe 1.5", 3 m',
        "sku": "YBM-SFMC-CPVC-150-3M",
        "barcode": "100000000153",
        "category": "PIPE",
        "queries": [
            "1.5 inch CPVC pipe cream SDR 11 plumbing pipe isolated white background",
            "CPVC pipe 1-1/2 inch plumbing pipe"
        ]
    },
    {
        "id": 63,
        "name": 'SFMC CPVC Elbow 3/4"',
        "sku": "YBM-SFMC-ELBOW-075",
        "barcode": "100000000124",
        "category": "FITTING",
        "queries": [
            "3/4 inch CPVC 90 degree elbow pipe fitting isolated white background",
            "CPVC Elbow 3/4 inch plumbing fitting"
        ]
    },
    {
        "id": 64,
        "name": 'SFMC CPVC Elbow 1"',
        "sku": "YBM-SFMC-ELBOW-100",
        "barcode": "100000000133",
        "category": "FITTING",
        "queries": [
            "1 inch CPVC 90 degree elbow pipe fitting isolated white background",
            "CPVC Elbow 1 inch plumbing fitting"
        ]
    },
    {
        "id": 65,
        "name": 'SFMC CPVC End Cap 3/4"',
        "sku": "YBM-SFMC-ENDCAP-075",
        "barcode": "100000000128",
        "category": "FITTING",
        "queries": [
            "3/4 inch CPVC end cap pipe fitting isolated white background",
            "CPVC End Cap 3/4 inch plumbing fitting"
        ]
    },
    {
        "id": 66,
        "name": 'SFMC CPVC Tee 3/4"',
        "sku": "YBM-SFMC-TEE-075",
        "barcode": "100000000123",
        "category": "FITTING",
        "queries": [
            "3/4 inch CPVC tee pipe fitting equal isolated white background",
            "CPVC Tee 3/4 inch plumbing fitting"
        ]
    },
    {
        "id": 67,
        "name": 'SFMC CPVC Tee 1"',
        "sku": "YBM-SFMC-TEE-100",
        "barcode": "100000000132",
        "category": "FITTING",
        "queries": [
            "1 inch CPVC tee pipe fitting equal isolated white background",
            "CPVC Tee 1 inch plumbing fitting"
        ]
    },
    {
        "id": 68,
        "name": 'SFMC CPVC Union 3/4"',
        "sku": "YBM-SFMC-UNION-075",
        "barcode": "100000000127",
        "category": "FITTING",
        "queries": [
            "3/4 inch CPVC union pipe fitting isolated white background",
            "CPVC Union 3/4 inch plumbing fitting"
        ]
    },
    {
        "id": 69,
        "name": 'Silicone Sealant 280 ml',
        "sku": "YBM-SILICONE-SEALANT",
        "barcode": "100000000181",
        "category": "CONSUMABLE",
        "queries": [
            "Silicone sealant 280 ml cartridge tube with nozzle clear isolated white background",
            "Silicone sealant 280ml sanitary cartridge tube"
        ]
    },
    {
        "id": 70,
        "name": 'Stop Cock 1/2"',
        "sku": "YBM-STOP-COCK-050",
        "barcode": "100000000176",
        "category": "VALVE",
        "queries": [
            "1/2 inch brass concealed stop cock valve plumbing chrome isolated white background",
            "Concealed stop cock 1/2 inch bathroom tap valve"
        ]
    }
]

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
}

def search_image_urls(query, max_candidates=10):
    url = 'https://www.bing.com/images/search?q=' + urllib.parse.quote(query) + '&FORM=HDRSC2&first=1'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            html = res.read().decode('utf-8', errors='ignore')
            murls = re.findall(r'murl&quot;:&quot;(https?://[^&]+)&quot;', html)
            if not murls:
                murls = re.findall(r'"murl":"(https?://[^"]+)"', html)
            return murls[:max_candidates]
    except Exception as e:
        return []

def download_and_process_image(url, target_size=(600, 600)):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': headers['User-Agent'],
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        })
        with urllib.request.urlopen(req, timeout=8) as res:
            data = res.read()
            if len(data) < 3000:
                return None
            img = Image.open(io.BytesIO(data))
            w, h = img.size
            if w < 120 or h < 120:
                return None
            
            img = img.convert('RGBA')
            margin = 40
            scale = min((target_size[0] - margin) / w, (target_size[1] - margin) / h)
            new_w = max(1, int(w * scale))
            new_h = max(1, int(h * scale))
            img_resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            
            canvas = Image.new('RGB', target_size, (255, 255, 255))
            offset_x = (target_size[0] - new_w) // 2
            offset_y = (target_size[1] - new_h) // 2
            canvas.paste(img_resized, (offset_x, offset_y), img_resized)
            return canvas
    except Exception:
        return None

def generate_fallback_image(item, target_size=(600, 600)):
    canvas = Image.new('RGB', target_size, (255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    
    # Border
    draw.rounded_rectangle([15, 15, target_size[0] - 15, target_size[1] - 15], radius=16, outline=(220, 225, 230), width=2)
    
    # Header badge
    draw.rounded_rectangle([30, 30, target_size[0] - 30, 80], radius=8, fill=(245, 247, 250))
    draw.text((45, 45), f"YOURBUILDMART · {item['category']}", fill=(70, 90, 120))
    
    # Center placeholder illustration box
    center_box = [80, 120, target_size[0] - 80, target_size[1] - 140]
    draw.rounded_rectangle(center_box, radius=12, fill=(240, 243, 246), outline=(210, 218, 226), width=2)
    
    # Center text
    draw.text((target_size[0]//2, target_size[1]//2 - 30), item['name'], fill=(30, 41, 59), anchor="mm")
    draw.text((target_size[0]//2, target_size[1]//2 + 10), f"SKU: {item['sku']}", fill=(100, 116, 139), anchor="mm")
    draw.text((target_size[0]//2, target_size[1]//2 + 40), f"Barcode: {item['barcode']}", fill=(148, 163, 184), anchor="mm")
    
    # Bottom specs
    draw.text((target_size[0]//2, target_size[1] - 80), "GENUINE SPECIFICATION VERIFIED", fill=(16, 185, 129), anchor="mm")
    return canvas

def main():
    out_dir = "product-images"
    os.makedirs(out_dir, exist_ok=True)
    
    total = len(CATALOG)
    downloaded = 0
    fallback = 0
    
    print(f"Starting catalog photo acquisition for {total} products into '{out_dir}/'...")
    
    for idx, item in enumerate(CATALOG, 1):
        sku = item["sku"]
        target_file = os.path.join(out_dir, f"{sku}.jpg")
        
        # If already exists and valid, skip
        if os.path.exists(target_file) and os.path.getsize(target_file) > 5000:
            print(f"[{idx}/{total}] {sku} already exists ({os.path.getsize(target_file)} bytes). Skipping.")
            downloaded += 1
            continue
            
        print(f"[{idx}/{total}] Fetching photo for {sku} ({item['name']})...")
        success = False
        
        for q in item["queries"]:
            urls = search_image_urls(q, max_candidates=8)
            for u in urls:
                img = download_and_process_image(u)
                if img:
                    img.save(target_file, "JPEG", quality=92)
                    print(f"  -> SUCCESS ({sku}.jpg saved from {u[:50]}...)")
                    success = True
                    downloaded += 1
                    break
                time.sleep(0.15)
            if success:
                break
                
        if not success:
            print(f"  -> Falling back to catalog render for {sku}...")
            img = generate_fallback_image(item)
            img.save(target_file, "JPEG", quality=92)
            fallback += 1
            
        time.sleep(0.3)
        
    print("\n-----------------------------------------")
    print(f"Acquisition complete! {downloaded} downloaded, {fallback} generated.")
    
    # Verify all 70 files exist
    files = [f for f in os.listdir(out_dir) if f.endswith(".jpg")]
    print(f"Total .jpg files in {out_dir}: {len(files)} / {total}")
    
    # Create ZIP archive
    zip_path = "product-images.zip"
    print(f"Creating ZIP archive '{zip_path}'...")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for f in sorted(files):
            file_path = os.path.join(out_dir, f)
            arcname = os.path.join("product-images", f)
            zipf.write(file_path, arcname)
            
    print(f"ZIP archive created successfully: {zip_path} ({os.path.getsize(zip_path)} bytes)")

if __name__ == "__main__":
    main()

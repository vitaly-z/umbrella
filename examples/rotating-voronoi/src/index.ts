import { canvas } from "@thi.ng/hdom-canvas";
import { DVMesh } from "@thi.ng/geom-voronoi";
import { simplify } from "@thi.ng/geom-resample";
import {
    pathFromCubics,
    asCubic,
    svgDoc,
    rect,
    group,
    points,
    polygon,
    asSvg
} from "@thi.ng/geom";
import { CubicOpts } from "@thi.ng/geom-api";
import { cartesian2, Vec } from "@thi.ng/vectors";
import { TAU, PI } from "@thi.ng/math";
import { clearDOM } from "@thi.ng/hdom";
import { updateDOM } from "@thi.ng/transducers-hdom";
import {
    AppState,
    scaleStream,
    animationStream,
    frameStreamConditional,
    frameStream,
    keyStream,
    keyStreamConditional,
    mainStream
} from "./stream-state";
import {
    map,
    iterator1,
    normRange,
    comp,
    mapcat,
    iterator
} from "@thi.ng/transducers";
import { SYSTEM } from "@thi.ng/random";
import { slider, checkbox } from "./controllers";
import { download } from "./download";

const edge = window.innerWidth * 0.7;
const width = edge;
const height = edge;
const radius = (width / 2) * 0.8;
const center = [width / 2, height / 2];

const rndInt = (min: number, max: number) => SYSTEM.minmax(min, max) | 0;

const startingCircles: Array<[number, number, boolean]> = [
    [radius / 1, rndInt(4, 20), true],
    [radius / 2, rndInt(4, 20), false],
    [radius / 4, rndInt(4, 20), true],
    [radius / 8, rndInt(4, 20), false]
];

const pointsInCircle = (
    _center: Vec,
    _radius: number,
    _num: number,
    _angle: number
) => [
    ...iterator1(
        map((index) =>
            cartesian2([], [_radius, index * TAU + _angle], _center)
        ),
        normRange(_num, false)
    )
];

scaleStream.next(1);
frameStreamConditional.next(0);
animationStream.next(false);
const startKeyEvent: KeyboardEvent = document.createEvent("KeyboardEvent");
startKeyEvent.initEvent("keyup");
keyStreamConditional.next(startKeyEvent);

const app = (...args: any) => (state: AppState) => appRender(state);
mainStream.transform(
    map(app(scaleStream, animationStream, frameStream, keyStream)),
    updateDOM()
);

function computeVoronoi(state: AppState) {
    const delta = state.frameValue / 100;
    const doSave = state.keyValue === "s";

    const opts: CubicOpts = {
        breakPoints: false,
        uniform: false,
        scale: state.scaleValue
    };

    const startPoints = [
        ...iterator(
            comp(
                map(([rad, density, clockwise]) =>
                    pointsInCircle(
                        center,
                        rad,
                        density,
                        clockwise ? delta : PI - delta
                    )
                ),
                mapcat((x) => x)
            ),
            startingCircles
        )
    ];

    const mesh = new DVMesh();
    mesh.addKeys(startPoints, 0.01);
    const bounds = [[0, 0], [width, 0], [width, height], [0, height]];
    const cells = mesh.voronoi(bounds);

    const voronoi = [
        rect([width, height], { fill: "black" }),

        group(
            { fill: "white", "stroke-width": 1 },
            cells.map((cell) =>
                pathFromCubics(
                    asCubic(polygon(simplify(cell, 0.01, true)), opts)
                )
            )
        ),
        points(doSave ? [] : startPoints, {
            size: 4,
            shape: "circle",
            fill: "gray"
        })
    ];

    if (doSave) {
        const svg = asSvg(
            svgDoc(
                {
                    width,
                    height,
                    viewBox: `0 0 ${width} ${height}`,
                    "stroke-width": 0.25
                },
                ...voronoi
            )
        );
        download(`${new Date().getTime()}-voronoi.svg`, svg);
    }

    return voronoi;
}

function appRender(state: AppState) {
    return [
        "div.ma3.flex.flex-column.flex-row-l.flex-row-m",
        [
            [
                "div.pr3.w-100.w-30-l.w-30-m",
                ["h1", "Rotating voronoi"],
                [
                    "p",
                    [
                        ["span", "Based on a M. Bostock"],
                        [
                            "a",
                            {
                                href:
                                    "https://observablehq.com/@mbostock/rotating-voronoi"
                            },
                            " observablehq sketch"
                        ],
                        ["span", ". "],

                        ["span", "Originally from an "],
                        [
                            "a",
                            {
                                href:
                                    "https://www.flickr.com/photos/quasimondo/8254540763/"
                            },
                            "ornament"
                        ],
                        ["span", " by Mario Klingemann."]
                    ]
                ],
                ["p", "Press `s` to save the SVG file."],
                [
                    "div.mv3",
                    slider(
                        state.scaleValue,
                        (x: number) => scaleStream.next(x),
                        0,
                        1.2,
                        0.01,
                        "Tangent scale factor"
                    ),
                    checkbox(
                        state.animationValue,
                        (x: boolean) => animationStream.next(x),
                        "Animation"
                    )
                ]
            ],
            [
                "div.flex.justify-center",
                [canvas, { width, height }, ...computeVoronoi(state)]
            ]
        ]
    ];
}

if (process.env.NODE_ENV !== "production") {
    const hot = (<any>module).hot;
    hot &&
        hot.dispose(() => {
            const app = document.getElementById("app");
            app && clearDOM(app);
        });
}

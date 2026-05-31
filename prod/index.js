function board() {
    const board = document.querySelector(".board");
    const folder = document.querySelector(".folder");
    const analytics = document.querySelector(".analytics");

    board.style.display = "flex";
    folder.style.display = "none";
    analytics.style.display = "none";
}

function folder() {
    const board = document.querySelector(".board");
    const folder = document.querySelector(".folder");
    const analytics = document.querySelector(".analytics");

    board.style.display = "none";
    folder.style.display = "flex";
    analytics.style.display = "none";
}

function analitics() {
    const board = document.querySelector(".board");
    const folder = document.querySelector(".folder");
    const analytics = document.querySelector(".analytics");

    board.style.display = "none";
    folder.style.display = "none";
    analytics.style.display = "flex";
}

const app = FastAPI()
let Board_ID = null;
let COLUMN_MAP = {};


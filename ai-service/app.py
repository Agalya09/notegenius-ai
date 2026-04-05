from flask import Flask, request, jsonify

app = Flask(__name__)

def split_sentences(text):
    return [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]

def generate_short_summary(sentences):
    summary_sentences = []

    for sentence in sentences:
        if len(sentence.split()) > 8:
            summary_sentences.append(sentence)
        if len(summary_sentences) == 2:
            break

    if not summary_sentences:
        summary_sentences = sentences[:2]

    final_summary = ". ".join(summary_sentences)
    if final_summary:
        final_summary += "."
    return final_summary

def generate_key_points(sentences):
    points = []

    for sentence in sentences:
        words = sentence.split()
        if len(words) > 6:
            points.append(sentence)
        if len(points) == 4:
            break

    return points

@app.route("/summarize", methods=["POST"])
def summarize():
    data = request.json
    text = data.get("text", "").strip()

    if len(text) < 20:
        return jsonify({
            "summary": "Text too short",
            "points": []
        })

    sentences = split_sentences(text)

    short_summary = generate_short_summary(sentences)
    key_points = generate_key_points(sentences)

    return jsonify({
        "summary": short_summary,
        "points": key_points
    })

app.run(port=5001)
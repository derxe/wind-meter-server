FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
#RUN addgroup --system docker && adduser --disabled-password --gecos '' flaskuser && adduser flaskuser docker
#USER flaskuser
EXPOSE 5000
#CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
CMD ["python", "app.py"]
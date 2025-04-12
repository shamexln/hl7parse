function exportData() {
    fetch('/exportExcel')
        .then(response => response.json())
        .then(data => {
            alert(data.message);
        })
        .catch(err => {
            alert('Error exporting data. Check logs.');
        });
}

function queryPatient() {
    let patientId = document.getElementById('patientIdInput').value.trim();

    if (!patientId) {
        alert("Please enter a patient ID.");
        return;
    }

    fetch(`/api/patients/${encodeURIComponent(patientId)}`)
    .then(async response => {
        if (!response.ok) {
            // 考虑后端返回的错误消息
            const errorData = await response.json();
            throw new Error(errorData.message || "Server error when fetching patient data");
        }
        return response.json();
    })
    .then(patient => { // 这里得到的patient对象，就是你的data本身
        let resultDiv = document.getElementById('patientResult');
        
        // 生成表头和数据行
        let table = '<table border="1"><thead><tr>';

        for (const key in patient) {
            table += `<th>${key}</th>`;
        }
        table += '</tr></thead><tbody><tr>';

        for (const key in patient) {
            table += `<td>${patient[key]}</td>`;
        }
        table += '</tr></tbody></table>';

        resultDiv.innerHTML = table;
    })
    .catch(err => {
        console.error(err);
        document.getElementById('patientResult').innerHTML = `<p>${err.message}</p>`;
    });

}